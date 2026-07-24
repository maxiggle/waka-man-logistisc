package com.wakaman.rider.location

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Foreground service that keeps GPS fixes flowing while the app is backgrounded.
 * Fixes are handed to [RiderLocationPlugin] via [listener] and cross the
 * Capacitor bridge as `location` events — publishing to the backend stays in JS.
 */
class LocationForegroundService : Service() {

    private lateinit var fusedClient: FusedLocationProviderClient
    private var callback: LocationCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val deliveryId = intent?.getStringExtra(EXTRA_DELIVERY_ID) ?: "delivery"
        val intervalMs = intent?.getLongExtra(EXTRA_INTERVAL_MS, DEFAULT_INTERVAL_MS)
            ?: DEFAULT_INTERVAL_MS

        startInForeground(deliveryId)
        requestUpdates(intervalMs)
        isRunning = true
        return START_STICKY
    }

    override fun onDestroy() {
        removeLocationUpdates()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        isRunning = false
        super.onDestroy()
    }

    private fun removeLocationUpdates() {
        callback?.let { fusedClient.removeLocationUpdates(it) }
        callback = null
    }

    private fun startInForeground(deliveryId: String) {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Delivery tracking",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { description = "Shown while a delivery is being tracked" }
            )
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Tracking delivery $deliveryId")
            .setContentText("Your location is shared while this delivery is active.")
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            stopSelf()
        }
    }

    private fun requestUpdates(intervalMs: Long) {
        val fineGranted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (!fineGranted) {
            stopSelf()
            return
        }

        // Clean up any existing callback before starting a new request
        removeLocationUpdates()

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateDistanceMeters(0f)
            .build()

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return
                val isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    loc.isMock
                } else {
                    @Suppress("DEPRECATION")
                    loc.isFromMockProvider
                }
                val payload = JSObject().apply {
                    put("lat", loc.latitude)
                    put("lng", loc.longitude)
                    put("accuracy", loc.accuracy.toDouble())
                    if (loc.hasBearing()) put("heading", loc.bearing.toDouble())
                    else put("heading", JSObject.NULL)
                    if (loc.hasSpeed()) put("speed", loc.speed.toDouble())
                    else put("speed", JSObject.NULL)
                    put("timestamp", loc.time)
                    put("isMock", isMock)
                }
                listener?.invoke(payload)
            }
        }
        callback = cb
        try {
            fusedClient.requestLocationUpdates(request, cb, Looper.getMainLooper())
        } catch (e: SecurityException) {
            stopSelf()
        }
    }

    companion object {
        const val EXTRA_DELIVERY_ID = "deliveryId"
        const val EXTRA_INTERVAL_MS = "intervalMs"
        const val DEFAULT_INTERVAL_MS = 5000L
        private const val CHANNEL_ID = "wm_delivery_tracking"
        private const val NOTIFICATION_ID = 4821

        /** Set by [RiderLocationPlugin]; receives every fix as a bridge-ready payload. */
        @Volatile
        var listener: ((JSObject) -> Unit)? = null

        @Volatile
        var isRunning: Boolean = false
            private set
    }
}
