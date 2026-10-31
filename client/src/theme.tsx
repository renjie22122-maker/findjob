import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import {useLanguage} from './i18n';

type Mode = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{ mode: Mode; dark: boolean; setMode: (mode: Mode) => void }>({ mode: 'system', dark: false, setMode: () => {} });
export const useAppTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const {language}=useLanguage();const locale=language==='zh'?zhCN:enUS;
  const [mode, setMode] = useState<Mode>(() => {
    try { const value = localStorage.getItem('findjob.theme'); return value === 'light' || value === 'dark' ? value : 'system'; }
    catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem('findjob.theme', mode); } catch { /* private browsing */ }
    ConfigProvider.config({ holderRender: (children) => <ConfigProvider locale={locale} theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>{children}</ConfigProvider> });
  }, [mode, dark,locale]);
  return <ThemeContext.Provider value={{ mode, dark, setMode }}>
    <ConfigProvider locale={locale} theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: dark ? '#91b3ff' : '#395fe8', borderRadius: 16, colorBgLayout: dark ? '#101722' : '#f5f7fb', colorBgContainer: dark ? '#182231' : '#ffffff', colorBorderSecondary: dark ? '#2b394d' : '#e4eaf3', fontFamily: 'Inter, Segoe UI, Microsoft YaHei, sans-serif', controlHeight: 40 } }}>{children}</ConfigProvider>
  </ThemeContext.Provider>;
}
