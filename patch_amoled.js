const fs = require('fs');

// Patch amoled.ts
let amoledContent = fs.readFileSync('src/amoled.ts', 'utf8');
amoledContent = amoledContent.replace(
  /clock\.style\.transition = 'none'\s+document\.body\.classList\.remove\('amoled-active'\)\s+\/\/ Re-habilita a transição no próximo frame, depois do repositionamento\s+requestAnimationFrame\(\(\) => \{\s+requestAnimationFrame\(\(\) => \{\s+clock\.style\.transition = ''\s+\}\)\s+\}\)/g,
  `clock.style.transition = 'none'
      clock.style.animation = 'none'
      document.body.classList.remove('amoled-active')
      // Força reflow para o navegador aplicar a remoção imediatamente
      void clock.offsetHeight
      // Re-habilita a transição e a animação
      requestAnimationFrame(() => {
        clock.style.transition = ''
        clock.style.animation = ''
      })`
);
fs.writeFileSync('src/amoled.ts', amoledContent);

// Patch style.css
let cssContent = fs.readFileSync('src/style.css', 'utf8');

cssContent = cssContent.replace(
  /animation: amoled-float 60s ease-in-out infinite alternate !important;/g,
  'animation: amoled-float 60s ease-in-out 2s infinite alternate !important;'
);

cssContent = cssContent.replace(
  /@keyframes amoled-float\s*\{\s*0%\s*\{\s*transform:\s*translate\(45%,\s*-45%\);\s*\}\s*25%\s*\{\s*transform:\s*translate\(55%,\s*-45%\);\s*\}\s*50%\s*\{\s*transform:\s*translate\(55%,\s*-55%\);\s*\}\s*75%\s*\{\s*transform:\s*translate\(45%,\s*-55%\);\s*\}\s*100%\s*\{\s*transform:\s*translate\(45%,\s*-45%\);\s*\}\s*\}/g,
  `@keyframes amoled-float {
  0% { transform: translate(50%, -50%); }
  25% { transform: translate(55%, -45%); }
  50% { transform: translate(55%, -55%); }
  75% { transform: translate(45%, -55%); }
  100% { transform: translate(50%, -50%); }
}`
);

fs.writeFileSync('src/style.css', cssContent);
