/**
 * @file WiFiManager.cpp
 * @brief Implementation of WiFi management
 */

#include "WiFiManager.h"

WiFiManager::WiFiManager()
    : state(CONN_DISCONNECTED),
      lastConnectAttempt(0),
      reconnectAttempts(0),
      powerSaveEnabled(false) {
}

bool WiFiManager::begin() {
    LOG_INFO("Initializing WiFi...");
    //WiFi.disconnect(true, true);
    delay(200);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);  // Don't save credentials to flash (battery saving)
    lastConnectAttempt = millis() - 6000; // Set lastConnectAttempt to a point in the past so the first connect() isn't blocked
    LOG_INFO("WiFi initialized");
    return true;
}

bool WiFiManager::connect(unsigned long timeout) {
    if (WiFi.status() == WL_CONNECTED) {
        state = CONN_CONNECTED;
        return true;
    }
    
    // Rate limit connection attempts
    if (millis() - lastConnectAttempt < 5000) {
        return false;
    }
    
    lastConnectAttempt = millis();
    
    return performConnection();
}

bool WiFiManager::performConnection() {
    state = CONN_CONNECTING;
    LOG_INFO("Connecting to WiFi: %s", WIFI_SSID);
    // ----- [ Optional ] -----
    // Static IP configuration goes here for < 2s connection times
    IPAddress local_IP(192, 168, 1, 150); // Use an IP outside your router's DHCP range
    IPAddress gateway(192, 168, 1, 1);
    IPAddress subnet(255, 255, 255, 0);
    IPAddress primaryDNS(8, 8, 8, 8); 
    WiFi.config(local_IP, gateway, subnet, primaryDNS);
    // ----- [ Optional ] -----
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    unsigned long startTime = millis();

    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < WIFI_CONNECT_TIMEOUT) {
        delay(50); // delay(100); Faster polling than 100ms
        if ((millis() - startTime) % 500 == 0) Serial.print("."); 
        //if (millis() - startTime > 1000) Serial.print(".");
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        LOG_INFO("WiFi connected!");
        LOG_INFO("IP address: %s", WiFi.localIP().toString().c_str());
        LOG_INFO("Signal strength: %d dBm", WiFi.RSSI());
        
        state = CONN_CONNECTED;
        reconnectAttempts = 0;
        
        // Enable power save mode if configured
        if (powerSaveEnabled) {
            WiFi.setSleep(WIFI_PS_MIN_MODEM);
            LOG_INFO("WiFi power save enabled");
        }
        
        return true;
    } else {
        Serial.println();
        LOG_ERROR("WiFi connection failed");
        state = CONN_ERROR;
        reconnectAttempts++;
        
        return false;
    }
}

void WiFiManager::disconnect() {
    if (WiFi.status() == WL_CONNECTED) {
        WiFi.disconnect(true);
        LOG_INFO("WiFi disconnected");
    }
    state = CONN_DISCONNECTED;
}

bool WiFiManager::isConnected() const {
    return WiFi.status() == WL_CONNECTED && state == CONN_CONNECTED;
}

int WiFiManager::getRSSI() const {
    if (isConnected()) {
        return WiFi.RSSI();
    }
    return -100;  // Invalid signal
}

String WiFiManager::getIPAddress() const {
    if (isConnected()) {
        return WiFi.localIP().toString();
    }
    return "0.0.0.0";
}

void WiFiManager::setPowerSaveMode(bool enable) {
    powerSaveEnabled = enable;
    
    if (isConnected()) {
        if (enable) {
            WiFi.setSleep(WIFI_PS_MIN_MODEM);
            LOG_INFO("WiFi power save enabled");
        } else {
            WiFi.setSleep(WIFI_PS_NONE);
            LOG_INFO("WiFi power save disabled");
        }
    }
}

/*void WiFiManager::loop() {
    // Check connection status
    if (WiFi.status() != WL_CONNECTED && state == CONN_CONNECTED) {
        LOG_WARN("WiFi connection lost");
        state = CONN_DISCONNECTED;
    }
    
    // Auto-reconnect
    if (!isConnected() && 
        reconnectAttempts < 5 &&
        (millis() - lastConnectAttempt) > WIFI_RECONNECT_INTERVAL) {
        LOG_INFO("Attempting WiFi reconnection...");
        connect();
    }
}*/

void WiFiManager::loop() {
    static unsigned long lastReconnectAttempt = 0;
    static unsigned long reconnectInterval = WIFI_RECONNECT_INTERVAL;
    
    wl_status_t currentStatus = WiFi.status();
    
    if (currentStatus != WL_CONNECTED) {
        if (state == CONN_CONNECTED) {
            LOG_WARN("WiFi connection lost");
            state = CONN_DISCONNECTED;
        }
        
        // Only attempt reconnection after interval
        if (millis() - lastReconnectAttempt >= reconnectInterval) {
            LOG_INFO("Attempting WiFi reconnection...");
            lastReconnectAttempt = millis();
            bool ok = connect();
            
            // Exponential backoff up to 30s
            if (!ok) {
                reconnectInterval = std::min(reconnectInterval * 2, 30000UL);
            } else {
                reconnectInterval = WIFI_RECONNECT_INTERVAL; // Reset after success
            }
        }
    } else {
        if (state != CONN_CONNECTED) {
            LOG_INFO("WiFi reconnected");
            state = CONN_CONNECTED;
            reconnectInterval = WIFI_RECONNECT_INTERVAL; // Reset backoff
        }
    }
}
