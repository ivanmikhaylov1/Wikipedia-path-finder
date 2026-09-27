import { ArrowUpRight } from 'lucide-react';

export function Footer() {
  const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/ivanmikhaylov1/Wikipedia-path-finder';
  return <footer className="footer"><div className="page-width footer-inner"><div className="footer-brand"><span className="brand-mark small-mark"><i /><i /><i /></span><span>ПЕРЕХОДЫ</span></div><p>Дело закрыто? Откройте следующее.</p><a href={githubUrl} target="_blank" rel="noopener noreferrer">КОД НА GITHUB <ArrowUpRight size={16} /></a></div></footer>;
}
