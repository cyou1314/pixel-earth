document.querySelector('#retry').addEventListener('click', () => location.reload());
try {
  const { startPlanet } = await import('./engine-v0.5.js');
  await startPlanet();
} catch (error) {
  console.error('Planet startup:', error);
  document.querySelector('#loading').hidden = true;
  document.querySelector('main').setAttribute('aria-busy', 'false');
  document.querySelector('#hint').textContent = '小地球暂时没有显示';
  document.querySelector('#error-message').textContent = '画面没有加载成功，请重新加载。';
  document.querySelector('#error').hidden = false;
}
