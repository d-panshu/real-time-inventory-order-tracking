import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const WS_URL = process.env.REACT_APP_WS_URL || 'http://localhost:5002';

export function useSocket() {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);         // live feed of all events
  const listenersRef = useRef({});

  useEffect(() => {
    if (!token) return;

    const socket = io(WS_URL, {
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('[WS] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      console.warn('[WS] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[WS] Connection error:', err.message);
    });

    // ── Global event listener — appends to live feed ─────────────────
    const allEvents = [
      'order:created',
      'order:status_updated',
      'order:cancelled',
      'order:new',
      'inventory:updated',
      'inventory:low_stock',
      'inventory:out_of_stock',
    ];

    allEvents.forEach((eventName) => {
      socket.on(eventName, (data) => {
        setEvents((prev) => [
          { id: Date.now(), eventName, data, receivedAt: new Date() },
          ...prev.slice(0, 99), // keep last 100
        ]);
        // Fire registered custom listeners
        listenersRef.current[eventName]?.forEach((cb) => cb(data));
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // ── Subscribe to specific order ────────────────────────────────────
  const subscribeToOrder = useCallback((orderId) => {
    socketRef.current?.emit('subscribe:order', orderId);
  }, []);

  const unsubscribeFromOrder = useCallback((orderId) => {
    socketRef.current?.emit('unsubscribe:order', orderId);
  }, []);

  // ── Subscribe to seller dashboard ──────────────────────────────────
  const subscribeToSeller = useCallback((sellerId) => {
    socketRef.current?.emit('subscribe:seller', sellerId);
  }, []);

  // ── Register a typed event listener ───────────────────────────────
  const on = useCallback((eventName, callback) => {
    if (!listenersRef.current[eventName]) {
      listenersRef.current[eventName] = [];
    }
    listenersRef.current[eventName].push(callback);
    return () => {
      listenersRef.current[eventName] = listenersRef.current[eventName].filter((cb) => cb !== callback);
    };
  }, []);

  return { connected, events, subscribeToOrder, unsubscribeFromOrder, subscribeToSeller, on };
}
