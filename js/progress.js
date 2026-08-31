const state = { timer: null, visible: false };

function els() {
  return {
    root: document.getElementById('progressWidget'),
    label: document.getElementById('progressLabel'),
    percent: document.getElementById('progressPercent'),
    bar: document.getElementById('progressBar'),
    detail: document.getElementById('progressDetail'),
  };
}

export function beginProgress(label, detail='', delayMs=450) {
  clearTimeout(state.timer);
  state.visible = false;
  const e = els();
  e.label.textContent = label;
  e.detail.textContent = detail;
  e.percent.textContent = '';
  e.bar.style.width = '0%';
  e.bar.classList.add('indeterminate');
  state.timer = setTimeout(() => {
    e.root.classList.remove('hidden');
    state.visible = true;
  }, delayMs);
}

export function setProgress(percent, label, detail) {
  const e = els();
  if (label) e.label.textContent = label;
  if (detail !== undefined) e.detail.textContent = detail;
  if (Number.isFinite(percent)) {
    const p = Math.max(0, Math.min(100, percent));
    e.bar.classList.remove('indeterminate');
    e.bar.style.width = `${p}%`;
    e.percent.textContent = `${Math.round(p)}%`;
  } else {
    e.bar.classList.add('indeterminate');
    e.percent.textContent = '';
  }
}

export function endProgress(detail='') {
  clearTimeout(state.timer);
  const e = els();
  if (detail && state.visible) {
    e.detail.textContent = detail;
    e.bar.classList.remove('indeterminate');
    e.bar.style.width = '100%';
    e.percent.textContent = '100%';
    setTimeout(() => e.root.classList.add('hidden'), 500);
  } else {
    e.root.classList.add('hidden');
  }
  state.visible = false;
}
