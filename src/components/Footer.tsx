
export function Footer() {
  const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/ivanmikhaylov1/Wikipedia-path-finder';
  return <footer className="footer"><div className="page-width footer-inner"><span className="footer-credit">С любовью, Sfafy</span><a href={githubUrl} target="_blank" rel="noopener noreferrer">Код на GitHub</a></div></footer>;
}
