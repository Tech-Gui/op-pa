import React, { useState, useEffect } from 'react';
import { Sun, Cloud, CloudRain, Wind, Droplets, CloudLightning, CloudSnow, Loader2 } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';
import axios from 'axios';

const WMO_ICONS = {
  0: Sun, // Clear sky
  1: Sun, 2: Cloud, 3: Cloud, // Mainly clear, partly cloudy, and overcast
  45: Cloud, 48: Cloud, // Fog
  51: CloudRain, 53: CloudRain, 55: CloudRain, // Drizzle
  61: CloudRain, 63: CloudRain, 65: CloudRain, // Rain
  71: CloudSnow, 73: CloudSnow, 75: CloudSnow, // Snow
  80: CloudRain, 81: CloudRain, 82: CloudRain, // Rain showers
  95: CloudLightning, 96: CloudLightning, 99: CloudLightning, // Thunderstorm
};

const WeatherWidget = () => {
  const { latitude, longitude, error: geoError, loading: geoLoading } = useGeolocation();
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      if (!latitude || !longitude) return;

      try {
        const response = await axios.get(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`
        );
        setWeather(response.data);
      } catch (err) {
        console.error('Weather fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [latitude, longitude]);

  if (geoLoading || loading) {
    return (
      <div className="glass-card weather-card loading-state">
        <Loader2 className="animate-spin" size={32} />
        <p>Fetching weather data...</p>
        <style jsx>{`
          .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            gap: 16px;
            background: var(--bg-accent);
            color: white;
          }
        `}</style>
      </div>
    );
  }

  if (geoError) {
    return (
      <div className="glass-card weather-card error-state">
        <p>Geolocation error: {geoError}</p>
        <p className="hint">Please enable location access for local weather.</p>
        <style jsx>{`
          .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            gap: 12px;
            background: var(--bg-accent);
            color: white;
            text-align: center;
          }
          .hint { font-size: 12px; opacity: 0.6; }
        `}</style>
      </div>
    );
  }

  const current = weather?.current_weather;
  const daily = weather?.daily;
  const CurrentIcon = WMO_ICONS[current?.weathercode] || Sun;

  const forecastDays = daily?.time.slice(1, 5).map((time, i) => {
    const date = new Date(time);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const Icon = WMO_ICONS[daily.weathercode[i+1]] || Sun;
    return {
      day: dayName,
      temp: `${Math.round(daily.temperature_2m_max[i+1])}°`,
      icon: Icon
    };
  });

  return (
    <div className="glass-card weather-card">
      <div className="current-weather">
        <div className="weather-main">
          <CurrentIcon size={64} color="var(--accent-orange)" />
          <div className="temp-info">
            <h2 className="current-temp">{Math.round(current?.temperature)}°</h2>
            <p className="weather-desc">Local Weather</p>
          </div>
        </div>
        <div className="weather-details">
          <div className="detail-item">
            <Wind size={18} />
            <span>{current?.windspeed} km/h</span>
          </div>
          <div className="detail-item">
            <Droplets size={18} />
            <span>{current?.winddirection}° Dir</span>
          </div>
        </div>
      </div>

      <div className="forecast-section">
        <h4 className="forecast-title">4-Day Forecast</h4>
        <div className="forecast-grid">
          {forecastDays?.map((item, index) => (
            <div key={index} className="forecast-item">
              <span className="day">{item.day}</span>
              <item.icon size={20} />
              <span className="temp">{item.temp}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .weather-card {
          background: var(--bg-accent);
          color: white;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .current-weather {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .weather-main {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .current-temp {
          font-size: 48px;
          font-weight: 700;
        }

        .weather-desc {
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
        }

        .weather-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .detail-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.8);
        }

        .forecast-section {
          background: rgba(255, 255, 255, 0.1);
          padding: 16px;
          border-radius: 16px;
        }

        .forecast-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 12px;
        }

        .forecast-grid {
          display: flex;
          justify-content: space-between;
        }

        .forecast-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .day {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
        }

        .temp {
          font-size: 13px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default WeatherWidget;
