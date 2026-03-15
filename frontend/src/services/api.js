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
  }
};

export default api;
