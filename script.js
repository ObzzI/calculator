/* ============================================================
   Badge Calculator — interaction & pricing logic
   ============================================================ */
(function () {
  'use strict';

  // ---------- Pricing table (from supplied data) ----------
  const PRICING_TIERS = [
    { min: 30,   max: 49,       label: '30–49 шт',       prices: { 37: 57.50, 50: 58.00, 58: 59.00, 75: 60.00 } },
    { min: 50,   max: 99,       label: '50–99 шт',       prices: { 37: 42.50, 50: 43.00, 58: 44.00, 75: 45.00 } },
    { min: 100,  max: 199,      label: '100–199 шт',     prices: { 37: 33.50, 50: 34.00, 58: 35.00, 75: 36.00 } },
    { min: 200,  max: 299,      label: '200–299 шт',     prices: { 37: 27.50, 50: 28.00, 58: 29.00, 75: 30.00 } },
    { min: 300,  max: 499,      label: '300–499 шт',     prices: { 37: 21.50, 50: 22.00, 58: 23.00, 75: 24.00 } },
    { min: 500,  max: 999,      label: '500–999 шт',     prices: { 37: 18.00, 50: 18.50, 58: 19.50, 75: 20.50 } },
    { min: 1000, max: 2999,     label: '1 000–2 999 шт', prices: { 37: 16.00, 50: 16.50, 58: 17.50, 75: 18.50 } },
    { min: 3000, max: 4999,     label: '3 000–4 999 шт', prices: { 37: 15.00, 50: 15.50, 58: 16.50, 75: 17.50 } },
    { min: 5000, max: Infinity, label: '5 000+ шт',      prices: { 37: 14.50, 50: 15.00, 58: 16.00, 75: 17.00 } },
  ];

  const DIAMETERS = [37, 50, 58, 75];
  const MIN_QTY = 30;
  const SLIDER_MAX = 6000;

  // Visual proportions for preview circle (max 75mm → 190px)
  const PREVIEW_BASE_PX = 190;
  // Visual proportions for compare circles (max 75mm → 44px)
  const COMPARE_BASE_PX = 44;

  // ---------- Formatters ----------
  const fmtInt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const fmtMoney = (v) =>
    new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  // ---------- State ----------
  const state = {
    quantity: 100,
    diameter: 50,
  };

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    qtyInput: $('#quantity'),
    qtySlider: $('#quantity-slider'),
    qtyBtns: $$('.qty-btn'),
    chips: $$('.chip'),
    warning: $('#qty-warning'),

    diamOptions: $$('.diameter-option'),
    previewCircle: $('#preview-circle'),
    previewLabel: $('#preview-label'),

    unitPrice: $('#unit-price'),
    qtyDisplay: $('#quantity-display'),
    tierDisplay: $('#tier-display'),
    totalPrice: $('#total-price'),
    nextTier: $('#next-tier'),

    compareGrid: $('#compare-grid'),
    compareQty: $('#compare-qty'),

    ctaBtn: $('#cta-btn'),
    toast: $('#toast'),
    toastText: $('#toast-text'),
  };

  // ---------- Pricing helpers ----------
  function findTier(quantity) {
    const q = Math.max(quantity, MIN_QTY);
    return PRICING_TIERS.find((t) => q >= t.min && q <= t.max) || PRICING_TIERS[0];
  }

  function getNextTier(currentTier) {
    const idx = PRICING_TIERS.indexOf(currentTier);
    return idx >= 0 && idx < PRICING_TIERS.length - 1 ? PRICING_TIERS[idx + 1] : null;
  }

  function priceFor(quantity, diameter) {
    return findTier(quantity).prices[diameter];
  }

  // ---------- Animated number ----------
  function animateNumber(el, to, formatter, duration = 380) {
    const fromText = (el.textContent || '0').replace(/[^\d.,-]/g, '').replace(/\s/g, '').replace(',', '.');
    const from = parseFloat(fromText) || 0;
    if (from === to) {
      el.textContent = formatter(to);
      return;
    }
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = from + (to - from) * eased;
      el.textContent = formatter(val);
      if (t < 1) el._raf = requestAnimationFrame(tick);
    }
    el._raf = requestAnimationFrame(tick);
  }

  function pulse(el) {
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth; // restart animation
    el.classList.add('pulse');
  }

  // ---------- Slider visual fill ----------
  function updateSliderFill() {
    const min = +els.qtySlider.min;
    const max = +els.qtySlider.max;
    const val = Math.max(min, Math.min(max, state.quantity));
    const pct = ((val - min) / (max - min)) * 100;
    els.qtySlider.style.setProperty('--progress', pct + '%');
  }

  // ---------- Preview circle ----------
  function updatePreview() {
    const px = Math.round((state.diameter / 75) * PREVIEW_BASE_PX);
    els.previewCircle.style.setProperty('--diam', px + 'px');
    els.previewLabel.textContent = `${state.diameter} мм`;
  }

  // ---------- Diameter buttons ----------
  function updateDiameterButtons() {
    els.diamOptions.forEach((btn) => {
      const d = +btn.dataset.diameter;
      const active = d === state.diameter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  // ---------- Chips ----------
  function updateChips() {
    els.chips.forEach((c) => {
      c.classList.toggle('active', +c.dataset.qty === state.quantity);
    });
  }

  // ---------- Comparison cards ----------
  function buildCompareGrid() {
    els.compareGrid.innerHTML = DIAMETERS.map((d) => {
      const size = Math.round((d / 75) * COMPARE_BASE_PX);
      return `
        <button class="compare-item" data-diameter="${d}" type="button" aria-label="Выбрать диаметр ${d} мм">
          <span class="compare-circle" style="--size:${size}px" aria-hidden="true"></span>
          <div class="compare-info">
            <span class="compare-diam">${d} мм</span>
            <span class="compare-unit" data-role="unit"></span>
          </div>
          <span class="compare-total" data-role="total"></span>
        </button>
      `;
    }).join('');

    els.compareGrid.querySelectorAll('.compare-item').forEach((item) => {
      item.addEventListener('click', () => {
        setDiameter(+item.dataset.diameter, true);
      });
    });
  }

  function updateCompareGrid() {
    const q = Math.max(state.quantity, MIN_QTY);
    els.compareQty.textContent = fmtInt.format(q);
    els.compareGrid.querySelectorAll('.compare-item').forEach((item) => {
      const d = +item.dataset.diameter;
      const unit = priceFor(q, d);
      const total = unit * q;
      const unitEl = item.querySelector('[data-role="unit"]');
      const totalEl = item.querySelector('[data-role="total"]');
      unitEl.textContent = `${fmtMoney(unit)} ₽/шт`;
      totalEl.innerHTML = `${fmtInt.format(total)}<span class="rub-small"> ₽</span>`;
      item.classList.toggle('active', d === state.diameter);
    });
  }

  // ---------- Next-tier hint ----------
  function updateNextTierHint() {
    const tier = findTier(state.quantity);
    const next = getNextTier(tier);
    if (!next || state.quantity < MIN_QTY) {
      els.nextTier.classList.add('hidden');
      return;
    }
    const need = next.min - state.quantity;
    if (need <= 0) {
      els.nextTier.classList.add('hidden');
      return;
    }
    const currentUnit = tier.prices[state.diameter];
    const nextUnit = next.prices[state.diameter];
    const savePerPiece = currentUnit - nextUnit;
    if (savePerPiece <= 0) {
      els.nextTier.classList.add('hidden');
      return;
    }
    els.nextTier.classList.remove('hidden');
    els.nextTier.innerHTML = `
      Закажите ещё <b>+${fmtInt.format(need)} шт</b> →
      цена <b>${fmtMoney(nextUnit)} ₽/шт</b>
      (экономия <b>${fmtMoney(savePerPiece)} ₽</b> на каждом)
    `;
  }

  // ---------- Main render ----------
  function render() {
    const effectiveQty = Math.max(state.quantity, MIN_QTY);
    const tier = findTier(effectiveQty);
    const unit = tier.prices[state.diameter];
    const total = unit * effectiveQty;

    // Quantity displays
    els.qtyDisplay.textContent = fmtInt.format(state.quantity);
    els.tierDisplay.textContent = tier.label;

    // Animated values
    animateNumber(els.unitPrice, unit, fmtMoney);
    animateNumber(els.totalPrice, total, (v) => fmtInt.format(v));

    // Warning if below min
    els.warning.classList.toggle('hidden', state.quantity >= MIN_QTY);

    // Other UI
    updateSliderFill();
    updatePreview();
    updateDiameterButtons();
    updateChips();
    updateCompareGrid();
    updateNextTierHint();
  }

  // ---------- Setters ----------
  function setQuantity(value, opts = {}) {
    const v = Math.max(1, Math.min(999999, Math.floor(value || 0)));
    if (v === state.quantity && !opts.force) return;
    state.quantity = v;

    if (!opts.fromInput) els.qtyInput.value = v;
    if (!opts.fromSlider) {
      els.qtySlider.value = Math.min(SLIDER_MAX, Math.max(+els.qtySlider.min, v));
    }
    if (opts.pulseTotal) pulse(els.totalPrice.parentElement);
    render();
  }

  function setDiameter(d, animate = false) {
    if (!DIAMETERS.includes(d)) return;
    if (d === state.diameter) return;
    state.diameter = d;
    if (animate) pulse(els.previewCircle);
    render();
  }

  // ---------- Event wiring ----------
  function wireEvents() {
    // Quantity input
    els.qtyInput.addEventListener('input', (e) => {
      const raw = e.target.value.replace(/\D/g, '');
      const v = parseInt(raw || '0', 10);
      setQuantity(v, { fromInput: true });
    });
    els.qtyInput.addEventListener('blur', () => {
      if (state.quantity < 1) setQuantity(1);
    });
    els.qtyInput.addEventListener('focus', (e) => e.target.select());

    // +/- buttons
    els.qtyBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const step = stepForQty(state.quantity);
        const newQty = action === 'increment' ? state.quantity + step : state.quantity - step;
        setQuantity(newQty, { pulseTotal: true });
      });
    });

    // Slider
    els.qtySlider.addEventListener('input', (e) => {
      setQuantity(+e.target.value, { fromSlider: true });
    });

    // Preset chips
    els.chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        setQuantity(+chip.dataset.qty, { pulseTotal: true });
      });
    });

    // Diameter buttons
    els.diamOptions.forEach((btn) => {
      btn.addEventListener('click', () => setDiameter(+btn.dataset.diameter, true));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const i = DIAMETERS.indexOf(state.diameter);
          setDiameter(DIAMETERS[(i + 1) % DIAMETERS.length], true);
          focusDiameter();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const i = DIAMETERS.indexOf(state.diameter);
          setDiameter(DIAMETERS[(i - 1 + DIAMETERS.length) % DIAMETERS.length], true);
          focusDiameter();
        }
      });
    });

    // CTA
    els.ctaBtn.addEventListener('click', () => {
      const tier = findTier(Math.max(state.quantity, MIN_QTY));
      const total = tier.prices[state.diameter] * Math.max(state.quantity, MIN_QTY);
      showToast(`Заказ оформлен: ${fmtInt.format(state.quantity)} шт × ${state.diameter} мм = ${fmtInt.format(total)} ₽`);
    });
  }

  function focusDiameter() {
    const active = document.querySelector('.diameter-option.active');
    if (active) active.focus();
  }

  // Smart step: bigger jumps for bigger numbers
  function stepForQty(q) {
    if (q < 100) return 10;
    if (q < 500) return 50;
    if (q < 1000) return 100;
    if (q < 5000) return 500;
    return 1000;
  }

  // ---------- Toast ----------
  let toastTimer;
  function showToast(text) {
    els.toastText.textContent = text;
    els.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 3200);
  }

  // ---------- Init ----------
  function init() {
    buildCompareGrid();
    wireEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
