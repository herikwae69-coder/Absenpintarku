import { useEffect, useCallback } from 'react';
import { Employee } from '../types';

export const useAutoLogout = (user: Employee | null, onLogout: () => void) => {
  const isRestricted = user?.role === 'admin' || user?.role === 'spv' || user?.role === 'superadmin';
  const timeoutDuration = 15 * 60 * 1000; // 15 minutes in milliseconds

  const startTimer = useCallback(() => {
    return setTimeout(onLogout, timeoutDuration);
  }, [onLogout, timeoutDuration]);

  useEffect(() => {
    if (!isRestricted) return;

    let timer: NodeJS.Timeout = startTimer();

    const activityHandler = () => {
      clearTimeout(timer);
      timer = startTimer();
    };

    window.addEventListener('mousemove', activityHandler);
    window.addEventListener('keydown', activityHandler);
    window.addEventListener('scroll', activityHandler);
    window.addEventListener('click', activityHandler);

    return () => {
      window.removeEventListener('mousemove', activityHandler);
      window.removeEventListener('keydown', activityHandler);
      window.removeEventListener('scroll', activityHandler);
      window.removeEventListener('click', activityHandler);
      clearTimeout(timer);
    };
  }, [isRestricted, startTimer]);
};
