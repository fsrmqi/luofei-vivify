export function connectQuickControls(api) {
  const byId = id => document.getElementById(id);
  const dialog = byId('quick-dialog');
  const volume = byId('quick-volume');
  const level = byId('quick-level');
  const mute = byId('quick-mute');
  const steady = byId('quick-steady');
  const breathe = byId('quick-breathe');
  const audio = { current: null, busy: false };
  const light = { current: null, busy: false };
  const feedback = byId('volume-feedback');
  const audioStatus = byId('quick-audio-status');
  let pendingVolume;
  let adjustingVolume = false;
  let feedbackTimer;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function meter(input, output, value, text) {
    input.value = value ?? 0;
    output.value = text;
    input.setAttribute('aria-valuetext', text);
    input.style.setProperty('--fill', `${100 * Number(input.value) / Number(input.max)}%`);
  }

  function renderVolume(value = audio.current?.volume) {
    meter(volume, byId('quick-volume-value'), value, value === undefined ? '—' : `${value}%`);
  }

  function renderLevel(value = light.current?.level) {
    const text = value === undefined ? '—' : value === 0 ? '已关闭' : `${value} / 4 档`;
    meter(level, byId('quick-level-value'), value, text);
  }

  function render(group) {
    if (group === audio) {
      volume.disabled = audio.busy || !audio.current;
      mute.disabled = volume.disabled || adjustingVolume;
      mute.setAttribute('aria-pressed', audio.current?.muted === true);
      mute.textContent = audio.current?.muted ? '取消静音' : '静音';
      renderVolume();
    } else {
      level.disabled = steady.disabled = breathe.disabled = light.busy || !light.current;
      steady.setAttribute('aria-pressed', light.current?.breathing === false);
      breathe.setAttribute('aria-pressed', light.current?.breathing === true);
      renderLevel();
    }
    byId('quick-refresh').disabled = audio.busy || light.busy || adjustingVolume;
  }

  async function update(group, endpoint, statusId, change) {
    if (group.busy) return;
    const focused = document.activeElement;
    group.busy = true;
    const status = byId(statusId);
    status.textContent = change ? '正在应用…' : '正在读取…';
    render(group);
    try {
      group.current = (await api(endpoint, change))[endpoint];
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
      if (change) {
        try { group.current = (await api(endpoint))[endpoint]; }
        catch { group.current = null; }
      } else group.current = null;
    } finally {
      group.busy = false;
      render(group);
      if (change && dialog.open && document.activeElement === document.body &&
          dialog.contains(focused) && !focused.disabled) focused.focus();
    }
  }

  function showVolume(value) {
    feedback.style.setProperty('--fill', `${value}%`);
    byId('volume-feedback-value').textContent = `${value}%`;
    feedback.hidden = false;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 950);
  }

  async function sendVolume() {
    if (adjustingVolume) return;
    adjustingVolume = true;
    mute.disabled = byId('quick-refresh').disabled = true;
    audioStatus.textContent = '';
    try {
      while (pendingVolume !== undefined) {
        const target = pendingVolume;
        pendingVolume = undefined;
        if (target === audio.current?.volume) continue;
        const [result] = await Promise.all([api('audio', { volume: target }), pause(65)]);
        audio.current = result.audio;
      }
    } catch (error) {
      pendingVolume = undefined;
      audioStatus.textContent = error.message;
      clearTimeout(feedbackTimer);
      feedback.hidden = true;
      try { audio.current = (await api('audio')).audio; }
      catch { audio.current = null; }
    } finally {
      adjustingVolume = false;
      render(audio);
    }
  }

  const updateAudio = change => adjustingVolume ? undefined :
    update(audio, 'audio', 'quick-audio-status', change);
  const updateLight = change => update(light, 'backlight', 'quick-light-status', change);
  const refresh = () => Promise.all([updateAudio(), updateLight()]);
  const open = () => { dialog.showModal(); void refresh(); };

  byId('quick-open').addEventListener('click', open);
  byId('touch-controls').addEventListener('click', open);
  byId('quick-refresh').addEventListener('click', refresh);
  byId('quick-help').addEventListener('click', () => {
    dialog.close();
    byId('help').showModal();
    byId('touch-section').focus();
  });
  volume.addEventListener('input', () => {
    pendingVolume = Number(volume.value);
    renderVolume(pendingVolume);
    showVolume(pendingVolume);
    void sendVolume();
  });
  dialog.addEventListener('close', () => {
    clearTimeout(feedbackTimer);
    feedback.hidden = true;
  });
  mute.addEventListener('click', () => updateAudio({ muted: !audio.current.muted }));
  level.addEventListener('input', () => renderLevel(Number(level.value)));
  level.addEventListener('change', () => updateLight({ level: Number(level.value) }));
  steady.addEventListener('click', () => updateLight({ breathing: false }));
  breathe.addEventListener('click', () => updateLight({ breathing: true }));
}
