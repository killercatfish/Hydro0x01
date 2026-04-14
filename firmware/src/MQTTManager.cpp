/**
 * @file MQTTManager.cpp
 * @brief Implementation of MQTT communication
 */

#include "MQTTManager.h"
#include <cmath>

// Static member initialization
MQTTManager* MQTTManager::instance = nullptr;

MQTTManager::MQTTManager() 
    : state(CONN_DISCONNECTED),
      lastConnectAttempt(0),
      reconnectAttempts(0) {
    instance = this;
}

/*bool MQTTManager::begin(WiFiClient &wifiClient) {
    LOG_INFO("Initializing MQTT client...");
    
    mqttClient.setClient(wifiClient);
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setKeepAlive(MQTT_KEEPALIVE);
    
    LOG_INFO("MQTT configured: %s:%d", MQTT_BROKER, MQTT_PORT);
    return true;
}*/

bool MQTTManager::begin(Client &netClient) {
    LOG_INFO("Initializing MQTT client...");
    
    mqttClient.setClient(netClient);
    // Default PubSubClient buffer (~256 B) is too small for TOPIC_SENSORS JSON + long topic; publish() fails silently.
    mqttClient.setBufferSize(2048);
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setKeepAlive(MQTT_KEEPALIVE);
    
    LOG_INFO("MQTT configured: %s:%d (TX buffer 2048 B)", MQTT_BROKER, MQTT_PORT);
    return true;
}

bool MQTTManager::connect() {
    if (mqttClient.connected()) {
        state = CONN_CONNECTED;
        return true;
    }
    
    // Rate limit connection attempts
    if (millis() - lastConnectAttempt < 5000) {
        return false;
    }
    
    lastConnectAttempt = millis();
    state = CONN_CONNECTING;
    
    LOG_INFO("Connecting to MQTT broker...");
    
    // Build last will message
    String lwt = String("{\"status\":\"offline\",\"timestamp\":") + millis() + "}";
    
    bool connected = false;
    
    if (strlen(MQTT_USER) > 0) {
        // Authenticated connection
        connected = mqttClient.connect(
            MQTT_CLIENT_ID,
            MQTT_USER,
            MQTT_PASSWORD,
            TOPIC_STATUS,
            MQTT_QOS,
            MQTT_RETAIN,
            lwt.c_str()
        );
    } else {
        // Anonymous connection
        connected = mqttClient.connect(
            MQTT_CLIENT_ID,
            TOPIC_STATUS,
            MQTT_QOS,
            MQTT_RETAIN,
            lwt.c_str()
        );
    }
    
    if (connected) {
        LOG_INFO("MQTT connected successfully");
        state = CONN_CONNECTED;
        reconnectAttempts = 0;
        
        // Subscribe to command topics
        subscribeToCommands();
        
        // Publish online status
        String onlineMsg = String("{\"status\":\"online\",\"firmware\":\"") + 
                          FIRMWARE_VERSION + "\",\"timestamp\":" + millis() + "}";
        publish(TOPIC_STATUS, onlineMsg, true);
        
        return true;
    } else {
        LOG_ERROR("MQTT connection failed, rc=%d", mqttClient.state());
        state = CONN_ERROR;
        reconnectAttempts++;
        
        if (reconnectAttempts >= MQTT_RECONNECT_ATTEMPTS) {
            LOG_WARN("Max MQTT reconnect attempts reached");
        }
        
        return false;
    }
}

void MQTTManager::disconnect() {
    if (mqttClient.connected()) {
        String offlineMsg = String("{\"status\":\"offline\",\"timestamp\":") + millis() + "}";
        publish(TOPIC_STATUS, offlineMsg, true);
        mqttClient.disconnect();
    }
    state = CONN_DISCONNECTED;
    LOG_INFO("MQTT disconnected");
}

bool MQTTManager::isConnected() {
    return mqttClient.connected() && state == CONN_CONNECTED;
}

void MQTTManager::loop() {
    if (mqttClient.connected()) {
        mqttClient.loop();
    } else if (reconnectAttempts < MQTT_RECONNECT_ATTEMPTS) {
        // Attempt to reconnect
        connect();
    }
}

bool MQTTManager::subscribeToCommands() {
    if (!mqttClient.connected()) {
        return false;
    }
    
    LOG_INFO("Subscribing to command topics...");
    
    bool success = true;
    success &= mqttClient.subscribe(TOPIC_CMD_PUMP, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_MODE, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_CONFIG, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_OTA, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_ENV, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_TANK, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_TEST, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_SENSORS, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_PH, MQTT_QOS);
    success &= mqttClient.subscribe(TOPIC_CMD_EC, MQTT_QOS);
    
    if (success) {
        LOG_INFO("Subscribed to all command topics");
    } else {
        LOG_ERROR("Failed to subscribe to some topics");
    }
    
    return success;
}

void MQTTManager::setCallback(MQTTCallback callback) {
    messageCallback = callback;
}

bool MQTTManager::publish(const char* topic, const char* payload, bool retain) {
    if (!mqttClient.connected()) {
        LOG_WARN("Cannot publish - MQTT not connected");
        return false;
    }
    
    bool success = mqttClient.publish(topic, payload, retain);
    
    if (success) {
        LOG_VERBOSE("Published to %s: %s", topic, payload);
    } else {
        LOG_ERROR("Failed to publish to %s", topic);
    }
    
    return success;
}

bool MQTTManager::publish(const char* topic, const String &payload, bool retain) {
    return publish(topic, payload.c_str(), retain);
}

bool MQTTManager::publishSensorData(const SensorData &data) {
    if (!data.valid) {
        LOG_WARN("Not publishing invalid sensor data");
        return false;
    }
    
    String payload = createJsonPayload(data);
    
    // Publish aggregated sensor data
    bool success = publish(TOPIC_SENSORS, payload, false);
    
    // Also publish individual sensor topics for easier consumption
    char buffer[32];
    
    snprintf(buffer, sizeof(buffer), "%.2f", data.waterTemp);
    publish(TOPIC_WATER_TEMP, buffer);
    
    snprintf(buffer, sizeof(buffer), "%.2f", data.airTemp);
    publish(TOPIC_AIR_TEMP, buffer);
    
    snprintf(buffer, sizeof(buffer), "%.2f", data.humidity);
    publish(TOPIC_AIR_HUMIDITY, buffer);
    
    snprintf(buffer, sizeof(buffer), "%.2f", data.pressure);
    publish(TOPIC_PRESSURE, buffer);

    if (data.reservoirDistance >= 0) {
        snprintf(buffer, sizeof(buffer), "%.2f", data.reservoirDistance);
        publish(TOPIC_RESERVOIR_DISTANCE, buffer);
        snprintf(buffer, sizeof(buffer), "%.2f", data.waterLevelPercent);
        publish(TOPIC_WATER_LEVEL, buffer);
        publish(TOPIC_WATER_LEVEL_PERCENT, buffer);
        snprintf(buffer, sizeof(buffer), "%.2f", data.waterLevelLitres);
        publish(TOPIC_WATER_LEVEL_LITRES, buffer);
    } else {
        snprintf(buffer, sizeof(buffer), "%d", data.waterLevelADC);
        publish(TOPIC_WATER_LEVEL_ADC, buffer);
        snprintf(buffer, sizeof(buffer), "%.2f", data.waterLevel);
        publish(TOPIC_WATER_LEVEL, buffer);
    }


    snprintf(buffer, sizeof(buffer), "%.2f", data.pH);
    publish(TOPIC_PH, buffer);
    
    snprintf(buffer, sizeof(buffer), "%.2f", data.ec);
    publish(TOPIC_EC, buffer);
    
    snprintf(buffer, sizeof(buffer), "%.2f", data.batteryVoltage);
    publish(TOPIC_BATTERY, buffer);
    
    return success;
}

bool MQTTManager::publishSystemStatus(const SystemStatus &status) {
    String payload = createStatusPayload(status);
    return publish(TOPIC_STATUS, payload, true);
}

bool MQTTManager::publishHeartbeat() {
    StaticJsonDocument<128> doc;
    doc["timestamp"] = millis();
    doc["uptime"] = millis() / 1000;
    doc["heap"] = ESP.getFreeHeap();
    
    String payload;
    serializeJson(doc, payload);
    
    return publish(TOPIC_HEARTBEAT, payload, false);
}

bool MQTTManager::publishError(const char* errorMsg) {
    StaticJsonDocument<256> doc;
    doc["timestamp"] = millis();
    doc["error"] = errorMsg;
    doc["heap"] = ESP.getFreeHeap();
    
    String payload;
    serializeJson(doc, payload);
    
    return publish(TOPIC_ERRORS, payload, false);
}

int MQTTManager::getLastError() {
    return mqttClient.state();
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

static void jsonSetFloat(JsonObject o, const char* key, float v) {
    if (!isfinite(static_cast<double>(v))) {
        o[key] = nullptr;
    } else {
        o[key] = v;
    }
}

String MQTTManager::createJsonPayload(const SensorData &data) {
    StaticJsonDocument<768> doc;
    
    doc["timestamp"] = data.timestamp;
    doc["valid"] = data.valid;
    
    JsonObject water = doc.createNestedObject("water");
    jsonSetFloat(water, "temperature", data.waterTemp);
    jsonSetFloat(water, "level", data.waterLevel);
    jsonSetFloat(water, "ph", data.pH);
    jsonSetFloat(water, "ec", data.ec);
    jsonSetFloat(water, "litres", data.waterLevelLitres);
    jsonSetFloat(water, "percent", data.waterLevelPercent);
    
    JsonObject air = doc.createNestedObject("air");
    jsonSetFloat(air, "temperature", data.airTemp);
    jsonSetFloat(air, "humidity", data.humidity);
    jsonSetFloat(air, "pressure", data.pressure);
    
    JsonObject reservoir = doc.createNestedObject("reservoir");
    jsonSetFloat(reservoir, "distance", data.reservoirDistance);
    
    JsonObject power = doc.createNestedObject("power");
    jsonSetFloat(power, "battery", data.batteryVoltage);
    
    String payload;
    serializeJson(doc, payload);
    
    return payload;
}

String MQTTManager::createStatusPayload(const SystemStatus &status) {
    StaticJsonDocument<256> doc;
    
    doc["timestamp"] = millis();
    doc["uptime"] = status.uptime;
    
    // System state
    const char* stateStr[] = {"INIT", "ACTIVE", "SLEEP", "EMERGENCY", "MAINTENANCE", "OTA"};
    doc["state"] = stateStr[status.state];
    
    // Connection states
    doc["wifi"] = (status.wifiState == CONN_CONNECTED) ? "connected" : "disconnected";
    doc["mqtt"] = (status.mqttState == CONN_CONNECTED) ? "connected" : "disconnected";
    
    // Pump state
    const char* pumpStr[] = {"OFF", "ON", "COOLDOWN", "ERROR"};
    doc["pump"] = pumpStr[status.pumpState];
    
    doc["errors"] = status.errorCount;
    doc["heap"] = ESP.getFreeHeap();
    doc["firmware"] = FIRMWARE_VERSION;
    
    String payload;
    serializeJson(doc, payload);
    
    return payload;
}

// Static callback handler
void MQTTManager::mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (instance == nullptr || instance->messageCallback == nullptr) {
        return;
    }
    
    // Null-terminate payload
    char message[length + 1];
    memcpy(message, payload, length);
    message[length] = '\0';
    
    LOG_DEBUG("MQTT message received on %s: %s", topic, message);
    
    // Call user callback
    instance->messageCallback(topic, message);
}