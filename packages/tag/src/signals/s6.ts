import type { Session, SignalsS6State, S6RawData } from '../types.js';

async function detectAudioConnection(): Promise<'speaker' | 'headphones' | 'bluetooth' | 'unknown'> {
  if (!navigator.mediaDevices?.enumerateDevices) return 'unknown';
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.label !== '');
    if (outputs.length === 0) return 'unknown';
    for (const d of outputs) {
      const label = d.label.toLowerCase();
      if (label.includes('bluetooth')) return 'bluetooth';
      if (
        label.includes('headphone') ||
        label.includes('earphone') ||
        label.includes('airpod') ||
        label.includes('headset')
      ) return 'headphones';
    }
    return 'speaker';
  } catch {
    return 'unknown';
  }
}

function isAudible(video: HTMLVideoElement): boolean {
  return !video.muted && video.volume > 0;
}

function accumulateAudibleTime(state: SignalsS6State): void {
  if (state.audibleTimeStart === null) return;
  state.audible_time_sec += (Date.now() - state.audibleTimeStart) / 1000;
  state.audibleTimeStart = null;
}

function checkQuartiles(state: SignalsS6State): void {
  if (state.duration <= 0) return;

  const pct = state.videoEl.currentTime / state.duration;
  const audible = isAudible(state.videoEl);

  if (!state.quartile_25 && pct >= 0.25) {
    state.quartile_25 = true;
    if (audible) state.audible_quartile_25 = true;
  }
  if (!state.quartile_50 && pct >= 0.50) {
    state.quartile_50 = true;
    if (audible) state.audible_quartile_50 = true;
  }
  if (!state.quartile_75 && pct >= 0.75) {
    state.quartile_75 = true;
    if (audible) state.audible_quartile_75 = true;
  }
  if (!state.completion && pct >= 1.0) {
    state.completion = true;
    state.completion_rate_pct = 100;
    if (audible) state.audible_quartile_100 = true;
  }
  if (pct * 100 > state.completion_rate_pct) {
    state.completion_rate_pct = Math.min(100, pct * 100);
  }
}

function updateMutedStatus(state: SignalsS6State): void {
  if (state.everMutedWhilePlaying && state.everUnmutedWhilePlaying) {
    state.muted_status = 'mixed';
  } else if (state.everUnmutedWhilePlaying) {
    state.muted_status = 'unmuted';
  } else {
    state.muted_status = 'muted';
  }
}

export function initS6(
  creativeEl: HTMLElement,
  session: Session,
): void {
  const videoEl = creativeEl.querySelector('video');
  if (!videoEl) {
    session.s6 = null;
    return;
  }

  const state: SignalsS6State = {
    videoEl,
    duration: isFinite(videoEl.duration) ? videoEl.duration : 0,
    lastSeekTime: videoEl.currentTime,
    isSeeking: false,
    videoEndedInSegment: false,
    audibleTimeStart: null,
    everMutedWhilePlaying: false,
    everUnmutedWhilePlaying: false,

    play_initiated: !videoEl.paused && !videoEl.ended,
    quartile_25: false,
    quartile_50: false,
    quartile_75: false,
    completion: false,
    completion_rate_pct: 0,
    pause_initiated: false,
    skipped: false,
    replay_count: 0,

    muted_status: 'muted',
    volume_level: Math.round(videoEl.volume * 100),
    audio_connection: 'unknown',
    audible_time_sec: 0,
    audible_quartile_25: false,
    audible_quartile_50: false,
    audible_quartile_75: false,
    audible_quartile_100: false,
    unmuted_by_user: false,
  };

  session.s6 = state;

  // Autoplay уже идёт до initS6 — фиксируем начальное состояние
  if (!videoEl.paused && !videoEl.ended) {
    if (isAudible(videoEl)) {
      state.audibleTimeStart = Date.now();
      state.everUnmutedWhilePlaying = true;
    } else {
      state.everMutedWhilePlaying = true;
    }
    updateMutedStatus(state);
  }

  detectAudioConnection().then((conn) => {
    state.audio_connection = conn;
  });

  let previousMuted = videoEl.muted;

  videoEl.addEventListener('loadedmetadata', () => {
    state.duration = videoEl.duration;
  });

  videoEl.addEventListener('play', () => {
    state.play_initiated = true;

    // Повторный просмотр после завершения (ended → play)
    if (state.videoEndedInSegment) {
      state.replay_count += 1;
      state.videoEndedInSegment = false;
    }

    if (isAudible(videoEl)) {
      if (state.audibleTimeStart === null) state.audibleTimeStart = Date.now();
      state.everUnmutedWhilePlaying = true;
    } else {
      state.everMutedWhilePlaying = true;
    }

    updateMutedStatus(state);
  });

  videoEl.addEventListener('pause', () => {
    state.pause_initiated = true;
    accumulateAudibleTime(state);
  });

  videoEl.addEventListener('ended', () => {
    state.completion = true;
    state.completion_rate_pct = 100;
    state.videoEndedInSegment = true;
    accumulateAudibleTime(state);
    if (isAudible(videoEl)) state.audible_quartile_100 = true;
  });

  videoEl.addEventListener('timeupdate', () => {
    if (!state.isSeeking) state.lastSeekTime = videoEl.currentTime;
    checkQuartiles(state);
    state.volume_level = Math.round(videoEl.volume * 100);
  });

  videoEl.addEventListener('volumechange', () => {
    const nowMuted = videoEl.muted;
    const nowAudible = isAudible(videoEl);
    const wasAudible = state.audibleTimeStart !== null;

    state.volume_level = Math.round(videoEl.volume * 100);

    if (!videoEl.paused && !videoEl.ended) {
      if (nowAudible && !wasAudible) {
        state.audibleTimeStart = Date.now();
        state.everUnmutedWhilePlaying = true;
        // Пользователь явно снял mute: previousMuted=true → nowMuted=false
        if (previousMuted && !nowMuted) state.unmuted_by_user = true;
      } else if (!nowAudible && wasAudible) {
        accumulateAudibleTime(state);
        state.everMutedWhilePlaying = true;
      }
    }

    previousMuted = nowMuted;
    updateMutedStatus(state);
  });

  videoEl.addEventListener('seeking', () => {
    state.isSeeking = true;
  });

  videoEl.addEventListener('seeked', () => {
    state.isSeeking = false;
    const newTime = videoEl.currentTime;
    // Перемотка назад (порог 0.5с исключает float-погрешности)
    if (newTime < state.lastSeekTime - 0.5) state.replay_count += 1;
    state.lastSeekTime = newTime;
    // Seek сбрасывает флаг ended: пользователь перемотал, а не переиграл
    if (state.videoEndedInSegment && newTime < state.duration - 0.5) {
      state.videoEndedInSegment = false;
    }
  });

  const skipEl = creativeEl.querySelector('[data-cpmind-skip]');
  if (skipEl) {
    skipEl.addEventListener('click', () => {
      state.skipped = true;
    });
  }
}

export function resetSegmentS6(session: Session): void {
  const state = session.s6;
  if (state === null) return;

  const video = state.videoEl;

  accumulateAudibleTime(state);

  state.duration = isFinite(video.duration) ? video.duration : 0;
  state.lastSeekTime = video.currentTime;
  state.isSeeking = false;
  state.videoEndedInSegment = false;
  state.audibleTimeStart = null;
  state.everMutedWhilePlaying = false;
  state.everUnmutedWhilePlaying = false;

  state.play_initiated = !video.paused && !video.ended;
  state.quartile_25 = false;
  state.quartile_50 = false;
  state.quartile_75 = false;
  state.completion = false;
  state.completion_rate_pct = 0;
  state.pause_initiated = false;
  state.skipped = false;
  state.replay_count = 0;

  state.muted_status = 'muted';
  state.volume_level = Math.round(video.volume * 100);
  state.audible_time_sec = 0;
  state.audible_quartile_25 = false;
  state.audible_quartile_50 = false;
  state.audible_quartile_75 = false;
  state.audible_quartile_100 = false;
  state.unmuted_by_user = false;

  // Если видео продолжает воспроизводиться в момент сброса — инициализируем новый сегмент
  if (!video.paused && !video.ended) {
    if (isAudible(video)) {
      state.audibleTimeStart = Date.now();
      state.everUnmutedWhilePlaying = true;
    } else {
      state.everMutedWhilePlaying = true;
    }
    updateMutedStatus(state);
  }
}

export function getS6Data(state: SignalsS6State): S6RawData {
  // Финализируем audible time если видео ещё воспроизводится
  let finalAudibleTimeSec = state.audible_time_sec;
  if (state.audibleTimeStart !== null) {
    finalAudibleTimeSec += (Date.now() - state.audibleTimeStart) / 1000;
  }

  const muted_throughout = state.play_initiated && !state.everUnmutedWhilePlaying;

  let muted_status: 'muted' | 'unmuted' | 'mixed';
  if (state.everMutedWhilePlaying && state.everUnmutedWhilePlaying) {
    muted_status = 'mixed';
  } else if (state.everUnmutedWhilePlaying) {
    muted_status = 'unmuted';
  } else {
    muted_status = 'muted';
  }

  return {
    play_initiated: state.play_initiated,
    quartile_25: state.quartile_25,
    quartile_50: state.quartile_50,
    quartile_75: state.quartile_75,
    completion: state.completion,
    completion_rate_pct: Math.min(100, state.completion_rate_pct),
    pause_initiated: state.pause_initiated,
    skipped: state.skipped,
    replay_count: state.replay_count,
    muted_status,
    volume_level: state.volume_level,
    audio_connection: state.audio_connection,
    audible_time_sec: finalAudibleTimeSec,
    duration_sec: state.duration > 0 ? state.duration : null,
    audible_quartile_25: state.audible_quartile_25,
    audible_quartile_50: state.audible_quartile_50,
    audible_quartile_75: state.audible_quartile_75,
    audible_quartile_100: state.audible_quartile_100,
    muted_throughout,
    unmuted_by_user: state.unmuted_by_user,
  };
}