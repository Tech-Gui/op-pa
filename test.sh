#!/bin/bash

# Test script to send pump commands to your nRF9160 via the backend
# Replace with your actual backend URL
BACKEND_URL="https://op-pt-unipot-backend.app.cern.ch"

# Replace with your device's IMEI (sensor_id) - you'll see this in the nRF9160 logs
DEVICE_IMEI="350457790738163"  # Update this with your actual IMEI

echo "🚰 nRF9160 Water Gateway Test Commands"
echo "======================================"
echo "Backend: $BACKEND_URL"
echo "Device IMEI: $DEVICE_IMEI"
echo ""

# Function to send water level reading (simulates nRF9160 sensor data)
send_water_reading() {
    local distance_cm=$1
    local relay_status=${2:-"off"}
    local tank_id=${3:-"north_tank"}
    
    echo "💧 Sending water level reading: ${distance_cm}cm (relay: $relay_status)..."
    
    curl -X POST "$BACKEND_URL/api/water/reading" \
        -H "Content-Type: application/json" \
        -d "{
            \"distance_cm\": $distance_cm,
            \"sensor_id\": \"$DEVICE_IMEI\",
            \"relay_status\": \"$relay_status\",
            \"tank_id\": \"$tank_id\"
        }" | jq '.'
    
    echo ""
}

# Function to send custom water reading
send_custom_reading() {
    echo "💧 Send Custom Water Level Reading"
    echo "================================="
    read -p "Enter distance in cm (e.g., 25.5): " distance
    read -p "Enter relay status (on/off) [off]: " relay_status
    relay_status=${relay_status:-off}
    
    send_water_reading "$distance" "$relay_status"
}

# Function to simulate water level scenarios
simulate_water_scenarios() {
    echo "🌊 Simulating Water Level Scenarios"
    echo "==================================="
    echo "1) Low water scenario (should trigger pump ON)"
    echo "2) Normal water scenario (should trigger pump OFF)"
    echo "3) Critical low water"
    echo "4) Water level recovery sequence"
    echo "5) Random water level simulation"
    echo ""
    read -p "Choose scenario [1-5]: " scenario
    
    case $scenario in
        1)
            echo "📉 Simulating LOW WATER (> 50cm from sensor)..."
            send_water_reading "75.0" "off"
            sleep 2
            send_water_reading "80.0" "off"
            sleep 2
            send_water_reading "85.0" "off"
            ;;
        2)
            echo "💧 Simulating NORMAL WATER (< 50cm from sensor)..."
            send_water_reading "30.0" "on"
            sleep 2
            send_water_reading "25.0" "on"
            sleep 2
            send_water_reading "20.0" "on"
            ;;
        3)
            echo "🚨 Simulating CRITICAL LOW WATER..."
            send_water_reading "120.0" "off"
            sleep 2
            send_water_reading "130.0" "off"
            ;;
        4)
            echo "🔄 Simulating WATER RECOVERY sequence..."
            echo "   Starting with low water..."
            send_water_reading "80.0" "off"
            sleep 3
            echo "   Pump should start, water rising..."
            send_water_reading "70.0" "on"
            sleep 3
            send_water_reading "60.0" "on"
            sleep 3
            send_water_reading "50.0" "on"
            sleep 3
            echo "   Water level reached, pump should stop..."
            send_water_reading "40.0" "on"
            sleep 3
            send_water_reading "30.0" "off"
            ;;
        5)
            echo "🎲 Sending random water level readings..."
            for i in {1..5}; do
                distance=$(awk "BEGIN {printf \"%.1f\", rand() * 100 + 10}")
                relay_status=$([ $((RANDOM % 2)) -eq 0 ] && echo "off" || echo "on")
                echo "   Reading $i/5:"
                send_water_reading "$distance" "$relay_status"
                sleep 2
            done
            ;;
        *)
            echo "❌ Invalid scenario choice."
            ;;
    esac
}

# Function to test threshold behavior
test_threshold_behavior() {
    echo "🎯 Testing Water Level Threshold Behavior"
    echo "========================================"
    echo "Testing around 50cm threshold (configured in nRF9160)..."
    echo ""
    
    echo "1️⃣ Sending reading ABOVE threshold (55cm - should trigger pump ON)..."
    send_water_reading "55.0" "off"
    sleep 3
    
    echo "2️⃣ Checking for pump command response..."
    check_pending_commands
    sleep 2
    
    echo "3️⃣ Sending reading BELOW threshold (45cm - should trigger pump OFF)..."
    send_water_reading "45.0" "on"
    sleep 3
    
    echo "4️⃣ Checking for pump command response..."
    check_pending_commands
    sleep 2
    
    echo "5️⃣ Testing edge case - exactly at threshold (50cm)..."
    send_water_reading "50.0" "on"
    sleep 2
    
    check_pending_commands
}

# Function to get latest readings
get_latest_readings() {
    echo "📊 Getting latest water readings..."
    
    curl -X GET "$BACKEND_URL/api/water/latest?tank_id=north_tank" \
        -H "Accept: application/json" | jq '.'
    
    echo ""
}

# Function to get reading history
get_reading_history() {
    echo "📈 Getting reading history..."
    
    read -p "Enter number of readings to retrieve [10]: " limit
    limit=${limit:-10}
    
    curl -X GET "$BACKEND_URL/api/water/readings?tank_id=north_tank&limit=$limit" \
        -H "Accept: application/json" | jq '.'
    
    echo ""
}

# Function to send pump control command
send_pump_command() {
    local action=$1
    local force_manual=${2:-false}
    
    echo "📡 Sending pump $action command..."
    
    curl -X POST "$BACKEND_URL/api/water/pump-control" \
        -H "Content-Type: application/json" \
        -d "{
            \"tank_id\": \"north_tank\",
            \"action\": \"$action\",
            \"force_manual\": $force_manual
        }" | jq '.'
    
    echo ""
}

# Function to check pending commands
check_pending_commands() {
    echo "🔍 Checking pending commands for device..."
    
    curl -X GET "$BACKEND_URL/api/water/pending-commands/$DEVICE_IMEI" \
        -H "Accept: application/json" | jq '.'
    
    echo ""
}

# Function to check pump status
check_pump_status() {
    echo "📊 Checking pump status..."
    
    curl -X GET "$BACKEND_URL/api/water/pump-status?tank_id=north_tank" \
        -H "Accept: application/json" | jq '.'
    
    echo ""
}

# Function to check system status
check_system_status() {
    echo "🖥️  Checking system status..."
    
    curl -X GET "$BACKEND_URL/api/water/system/status" \
        -H "Accept: application/json" | jq '.'
    
    echo ""
}

# Function to assign sensor to tank
assign_sensor() {
    echo "🔗 Assigning sensor to tank..."
    
    curl -X POST "$BACKEND_URL/api/water/assign-sensor" \
        -H "Content-Type: application/json" \
        -d "{
            \"tank_id\": \"north_tank\",
            \"sensor_id\": \"$DEVICE_IMEI\"
        }" | jq '.'
    
    echo ""
}

# Function to clear command queue
clear_commands() {
    echo "🧹 Clearing command queue..."
    
    curl -X DELETE "$BACKEND_URL/api/water/commands/clear" \
        -H "Accept: application/json" | jq '.'
    
    echo ""
}

# Main menu
while true; do
    echo "Choose an action:"
    echo ""
    echo "🔧 Pump Control:"
    echo "1) Turn pump ON"
    echo "2) Turn pump OFF"
    echo "3) Send relay ON command"
    echo "4) Send relay OFF command"
    echo ""
    echo "💧 Water Level Testing:"
    echo "5) Send custom water reading"
    echo "6) Simulate water scenarios"
    echo "7) Test threshold behavior"
    echo "8) Get latest readings"
    echo "9) Get reading history"
    echo ""
    echo "📊 System Status:"
    echo "10) Check pending commands"
    echo "11) Check pump status"
    echo "12) Check system status"
    echo ""
    echo "⚙️  Management:"
    echo "13) Assign sensor to tank"
    echo "14) Clear command queue"
    echo ""
    echo "0) Exit"
    echo ""
    read -p "Enter choice [0-14]: " choice
    
    case $choice in
        1)
            send_pump_command "start" true
            ;;
        2)
            send_pump_command "stop" true
            ;;
        3)
            echo "📡 Sending relay ON command..."
            curl -X POST "$BACKEND_URL/api/water/relay" \
                -H "Content-Type: application/json" \
                -d "{\"action\": \"on\", \"tank_id\": \"north_tank\"}" | jq '.'
            echo ""
            ;;
        4)
            echo "📡 Sending relay OFF command..."
            curl -X POST "$BACKEND_URL/api/water/relay" \
                -H "Content-Type: application/json" \
                -d "{\"action\": \"off\", \"tank_id\": \"north_tank\"}" | jq '.'
            echo ""
            ;;
        5)
            send_custom_reading
            ;;
        6)
            simulate_water_scenarios
            ;;
        7)
            test_threshold_behavior
            ;;
        8)
            get_latest_readings
            ;;
        9)
            get_reading_history
            ;;
        10)
            check_pending_commands
            ;;
        11)
            check_pump_status
            ;;
        12)
            check_system_status
            ;;
        13)
            assign_sensor
            ;;
        14)
            clear_commands
            ;;
        0)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "❌ Invalid choice. Please try again."
            ;;
    esac
    
    echo "Press Enter to continue..."
    read
    clear
done