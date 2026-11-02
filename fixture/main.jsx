import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from '@product/node_modules/antd';
import faIR from '@product/node_modules/antd/locale/fa_IR';
import { MemoryRouter } from '@product/node_modules/react-router-dom';
import ConnectionsTab from '@product/pages/Settings/ConnectionsTab';
import '@product/index.css';
import '@product/initDayjs';
import './style.css';
import brand from 'virtual:tutorial-brand';
import PhoneSimulation from './PhoneSimulation';
const externalApps = Object.fromEntries(Object.values(import.meta.glob('../external-apps/*.json', { eager: true, import: 'default' })).map(model => [model.id, model]));

function TutorialSurface() {
  const [surface, setSurface] = useState({ kind: 'product' });
  useEffect(() => {
    const update = event => setSurface(event.detail);
    window.addEventListener('tutorial-surface', update);
    return () => window.removeEventListener('tutorial-surface', update);
  }, []);
  return <><div hidden={surface.kind !== 'product'} data-tutorial-surface="product"><main className="tutorial-main"><ConnectionsTab /></main></div>
    {surface.kind === 'phone' && externalApps[surface.app] && <PhoneSimulation key={`${surface.app}:${surface.state}`} model={externalApps[surface.app]} stateKey={surface.state} />}</>;
}

createRoot(document.getElementById('root')).render(
  <MemoryRouter><ConfigProvider direction="rtl" locale={faIR} theme={{ token: { fontFamily: `${brand.fontFamily}, Tahoma, sans-serif`, colorPrimary: brand.palette.primary } }}><App>
    <div style={brand.cssVars}>
    <header className="tutorial-header"><strong><img src={brand.logo} alt="" style={{width:44,height:44,objectFit:'contain',verticalAlign:'middle',marginLeft:12}} />{brand.name}<span>آموزش اتصالات</span></strong><span className="training-label">محیط آموزشی · داده‌ها و پاسخ‌ها شبیه‌سازی شده‌اند</span></header>
    <TutorialSurface />
    </div>
  </App></ConfigProvider></MemoryRouter>
);
