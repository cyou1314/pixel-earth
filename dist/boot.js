// Keep retry and a useful message available even if the large renderer fails.
document.querySelector('#retry').addEventListener('click', () => location.reload());
import('./app.js').catch(error => {
  console.error('Planet application:', error);
  document.querySelector('#loading').hidden = true;
  document.querySelector('main').setAttribute('aria-busy', 'false');
  document.querySelector('#hint').textContent = '小地球暂时没有显示';
  document.querySelector('#error-message').textContent = '画面没有加载成功，请检查网络后重新加载。';
  document.querySelector('#error').hidden = false;
});
