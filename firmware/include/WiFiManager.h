/**
 * @file WiFiManager.h
 * @brief WiFi connection management
 * 
 * Handles WiFi connectivity with auto-reconnect and power management.
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include "config.h"

class WiFiManager {
public:
    WiFiManager();
    
    /**
     * @brief Initialize WiFi
     * @return true if WiFi initialized successfully
     */
    bool begin();
    
    /**
     * @brief Connect to WiFi network
     * @param timeout Connection timeout in milliseconds
     * @return true if connected
     */
    bool connect(unsigned long timeout = WIFI_CONNECT_TIMEOUT);
    
    /**
     * @brief Disconnect from WiFi
     */
    void disconnect();
    
    /**
     * @brief Check if connected
     */
    bool isConnected() const;
    
    /**
     * @brief Get connection state
     */
    ConnectionState getState() const { return state; }
    
    /**
     * @brief Get signal strength (RSSI)
     */
    int getRSSI() const;
    
    /**
     * @brief Get IP address
     */
    String getIPAddress() const;
    
    /**
     * @brief Set power mode for battery operation
     */
    void setPowerSaveMode(bool enable);
    
    /**
     * @brief Process WiFi reconnection (call in loop)
     */
    void loop();

private:
    ConnectionState state;
    unsigned long lastConnectAttempt;
    uint8_t reconnectAttempts;
    bool powerSaveEnabled;
    
    bool performConnection();
};

#endif // WIFI_MANAGER_H