package com.wakaman.rider.location

import android.Manifest
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "RiderLocation",
    permissions = [
        Permission(
            alias = RiderLocationPlugin.ALIAS_LOCATION,
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ]
        ),
        Permission(
            alias = RiderLocationPlugin.ALIAS_BACKGROUND,
            strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION]
        ),
        Permission(
            alias = RiderLocationPlugin.ALIAS_NOTIFICATIONS,
            strings = [Manifest.permission.POST_NOTIFICATIONS]
        )
    ]
)
class RiderLocationPlugin : Plugin() {

    override fun load() {
        LocationForegroundService.listener = { payload ->
            notifyListeners("location", payload)
        }
    }

    override fun handleOnDestroy() {
        LocationForegroundService.listener = null
        super.handleOnDestroy()
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        call.resolve(permissionStates())
    }

    /** Requests fine location and notifications permission (Android 13+). */
    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val aliases = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(ALIAS_LOCATION, ALIAS_NOTIFICATIONS)
        } else {
            arrayOf(ALIAS_LOCATION)
        }
        requestPermissionForAliases(aliases, call, "locationPermissionCallback")
    }

    @PermissionCallback
    private fun locationPermissionCallback(call: PluginCall) {
        call.resolve(permissionStates())
    }

    @PluginMethod
    fun requestBackgroundPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Background location is implied by fine location before Android 10.
            call.resolve(JSObject().put("background", "granted"))
            return
        }
        // Background location MUST be requested by itself on Android 11+
        requestPermissionForAlias(ALIAS_BACKGROUND, call, "backgroundPermissionCallback")
    }

    @PermissionCallback
    private fun backgroundPermissionCallback(call: PluginCall) {
        call.resolve(permissionStates())
    }

    @PluginMethod
    fun startTracking(call: PluginCall) {
        val deliveryId = call.getString("deliveryId")
        if (deliveryId.isNullOrBlank()) {
            call.reject("deliveryId is required")
            return
        }
        if (getPermissionState(ALIAS_LOCATION) != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Location permission not granted")
            return
        }
        val intervalMs = call.getInt("intervalMs")?.toLong()
            ?: LocationForegroundService.DEFAULT_INTERVAL_MS

        val intent = Intent(context, LocationForegroundService::class.java).apply {
            putExtra(LocationForegroundService.EXTRA_DELIVERY_ID, deliveryId)
            putExtra(LocationForegroundService.EXTRA_INTERVAL_MS, intervalMs)
        }
        try {
            ContextCompat.startForegroundService(context, intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to start location service: ${e.localizedMessage}", e)
        }
    }

    @PluginMethod
    fun stopTracking(call: PluginCall) {
        try {
            context.stopService(Intent(context, LocationForegroundService::class.java))
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to stop location service: ${e.localizedMessage}", e)
        }
    }

    @PluginMethod
    fun isTracking(call: PluginCall) {
        call.resolve(JSObject().put("tracking", LocationForegroundService.isRunning))
    }

    private fun permissionStates(): JSObject {
        val background =
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) "granted"
            else getPermissionState(ALIAS_BACKGROUND).toString().lowercase()
        val location = getPermissionState(ALIAS_LOCATION).toString().lowercase()
        return JSObject()
            .put("location", location)
            .put("background", background)
    }

    companion object {
        const val ALIAS_LOCATION = "location"
        const val ALIAS_BACKGROUND = "background"
        const val ALIAS_NOTIFICATIONS = "notifications"
    }
}
