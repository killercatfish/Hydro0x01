/**
 * @file MQTTManager.h
 * @brief MQTT communication and message handling
 * 
 * Handles all MQTT connectivity, publishing, and subscription.
 * Provides clean abstraction for cloud communication.
 */

#ifndef MQTT_MANAGER_H
#define MQTT_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"

// Callback function types
typedef std::function<void(const char* topic, const char* payload)> MQTTCallback;

class MQTTManager {
public:
    MQTTManager();
    
    /**
     * @brief Initialize MQTT client
     * @param wifiClient Reference to WiFi client
     * @return true if initialization successful
     */
    //bool begin(WiFiClient &wifiClient);
    bool begin(Client &netClient); // Modified signature
    
    /**
     * @brief Connect to MQTT broker
     * @return true if connected
     */
    bool connect();
    
    /**
     * @brief Disconnect from broker
     */
    void disconnect();
    
    /**
     * @brief Check if connected to broker
     */
    bool isConnected();
    
    /**
     * @brief Process MQTT messages (call in loop)
     */
    void loop();
    
    /**
     * @brief Publish sensor data
     */
    bool publishSensorData(const SensorData &data);
    bool publishSystemStatus(const SystemStatus &status);
    bool publishHeartbeat();
    bool publishError(const char* errorMsg);
    
    /**
     * @brief Publish to arbitrary topic
     */
    bool publish(const char* topic, const char* payload, bool retain = false);
    bool publish(const char* topic, const String &payload, bool retain = false);
    
    /**
     * @brief Subscribe to command topics
     */
    bool subscribeToCommands();
    
    /**
     * @brief Set callback for incoming messages
     */
    void setCallback(MQTTCallback callback);
    
    /**
     * @brief Get connection state
     */
    ConnectionState getState() const { return state; }
    
    /**
     * @brief Get last error
     */
    int getLastError();

private:
    PubSubClient mqttClient;
    MQTTCallback messageCallback;
    ConnectionState state;
    unsigned long lastConnectAttempt;
    uint8_t reconnectAttempts;
    
    // Internal MQTT callback (PubSubClient format)
    static void mqttCallback(char* topic, byte* payload, unsigned int length);
    static MQTTManager* instance;  // For static callback
    
    // Helper functions
    String createJsonPayload(const SensorData &data);
    String createStatusPayload(const SystemStatus &status);
    bool reconnect();
};

#endif // MQTT_MANAGER_H