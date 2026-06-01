import type { DeviceType } from '../types.js';

export function detectDeviceType(): DeviceType {

  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|windows phone/.test(ua)) return 'mobile';
  if (window.innerWidth <= 768 && 'ontouchstart' in window) return 'mobile';

  return 'desktop';
}