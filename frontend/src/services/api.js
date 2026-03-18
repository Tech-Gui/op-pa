import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const sensorsService = {
  getLatestReadings: async () => {
    try {
      const response = await api.get('/sensors/latest');
      return response.data;
    } catch (error) {
      console.error('Error fetching sensor readings:', error);
      return null;
    }
  },
  
  getWeatherStats: async () => {
    try {
      const response = await api.get('/environmental/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching weather stats:', error);
      return null;
    }
  },

  getWaterStats: async () => {
    try {
      const response = await api.get('/water/readings');
      return response.data;
    } catch (error) {
      console.error('Error fetching water stats:', error);
      return null;
    }
  },

  getSensorStatus: async (sensorId) => {
    try {
      const response = await api.get(`/sensors/status/${sensorId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching sensor status:', error);
      return null;
    }
  },

  sendPumpCommand: async (sensorId, action, target) => {
    try {
      const response = await api.post('/sensors/command', {
        sensor_id: sensorId,
        action,
        target,
        trigger: 'manual',
      });
      return response.data;
    } catch (error) {
      console.error('Error sending pump command:', error);
      throw error;
    }
  },

  setAutomation: async (sensorId, target, enabled) => {
    try {
      const response = await api.post('/sensors/automation', {
        sensor_id: sensorId,
        target,
        enabled,
      });
      return response.data;
    } catch (error) {
      console.error('Error setting automation:', error);
      throw error;
    }
  },

  setReportInterval: async (sensorId, interval) => {
    try {
      const response = await api.post('/sensors/interval', {
        sensor_id: sensorId,
        interval,
      });
      return response.data;
    } catch (error) {
      console.error('Error setting report interval:', error);
      throw error;
    }
  },
};

export default api;
