import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import english from './locales/en.json';
export function translate(value:string):string {return localStorage.getItem('careerflow.language')==='en'?(english as Record<string,string>)[value]??value:value;}
export type Language='zh'|'en';
const LanguageContext=createContext({language:'zh' as Language,setLanguage:(_value:Language)=>{},t:(zh:string,en:string)=>zh});
export const useLanguage=()=>useContext(LanguageContext);
export function LanguageProvider({children}:{children:ReactNode}){
 const [language,setLanguage]=useState<Language>(()=>localStorage.getItem('careerflow.language')==='en'?'en':'zh');
 useEffect(()=>{localStorage.setItem('careerflow.language',language);document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=language==='zh'?'赴程 · 求职进度与日程':'CareerFlow · Applications & schedules';},[language]);
 return <LanguageContext.Provider value={{language,setLanguage:(next)=>{localStorage.setItem('careerflow.language',next);setLanguage(next);},t:(zh,en)=>language==='zh'?zh:en}}>{children}</LanguageContext.Provider>;
}
