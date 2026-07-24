package com.wakaman.rider;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.wakaman.rider.location.RiderLocationPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RiderLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
