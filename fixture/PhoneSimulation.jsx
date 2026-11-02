import React, { useState } from 'react';
import './phone-simulation.css';

// Reusable educational stand-in. It never contacts or signs into an external app.
export default function PhoneSimulation({ model, stateKey }) {
  const state = model.states[stateKey];
  const [feedback, setFeedback] = useState(false);
  if (!state) return <div role="alert">این صحنهٔ آموزشی تعریف نشده است.</div>;
  const palette = model.palette;
  return <section className="external-stage" data-tutorial-surface="phone" style={{ '--external-primary': palette.primary, '--external-light': palette.light, '--external-surface': palette.surface, '--external-text': palette.text, '--external-accent': palette.accent }}>
    <div className="external-context"><span>آموزش مرحله‌به‌مرحله</span><h1>{state.title}</h1><p>{state.subtitle}</p><p className="external-note">این تصویر برای توضیح مسیر بازسازی شده؛ جزئیات ظاهر برنامه ممکنه فرق داشته باشه.</p></div>
    <div className="training-phone" dir="rtl" aria-label={`بازسازی آموزشی ${model.name}`}>
      <div className="phone-status" aria-hidden="true"><span>۹:۴۱</span><span className="phone-speaker"/><span>LTE ▰</span></div>
      <div className="phone-app-header"><span className="phone-avatar" aria-hidden="true"><img src={model.icon} alt="" /></span><div><strong>{model.name}</strong><small>{state.subtitle}</small></div></div>
      <div className="phone-disclosure">{model.disclosure}</div>
      <div className="phone-conversation">
        {state.messages.map((message, index) => <div key={index} className={`phone-message phone-message--${message.kind}`}>{message.text}</div>)}
        {state.tokenPlaceholder && <div className="phone-token"><span>توکن نمونه؛ قابل استفاده نیست</span><code>{state.tokenPlaceholder}</code></div>}
        {state.input && <label className="phone-input-label">{state.input.label}<input aria-label={state.input.label} placeholder={state.input.placeholder} autoComplete="off" /></label>}
        <button className="phone-action" onClick={() => setFeedback(true)}>{state.button}</button>
        {feedback && <div className="phone-feedback" role="status">مرحلهٔ نمونه انجام شد</div>}
      </div>
      <div className="phone-home" aria-hidden="true" />
    </div>
  </section>;
}
