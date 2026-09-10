const MobileUX = (() => {
  function close(){document.getElementById('more-menu').hidden=true;document.getElementById('nav-more').setAttribute('aria-expanded','false');}
  function init(){
    close();const menu=document.getElementById('more-menu');
    document.getElementById('nav-more').addEventListener('click',()=>{menu.hidden=!menu.hidden;document.getElementById('nav-more').setAttribute('aria-expanded',String(!menu.hidden));});
    for(const button of menu.querySelectorAll?.('[data-target]')||[])button.addEventListener('click',()=>App.navigate(button.dataset.target));
    document.getElementById('mobile-notebook').addEventListener('click',()=>{close();Notebook.open();});
    menu.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    const viewport=window.visualViewport;
    if(viewport){const resize=()=>{document.documentElement.style.setProperty('--visual-height',`${viewport.height}px`);document.documentElement.style.setProperty('--visual-top',`${viewport.offsetTop}px`);document.body.classList.toggle('keyboard-open',window.innerHeight-viewport.height>120);};viewport.addEventListener('resize',resize);viewport.addEventListener('scroll',resize);resize();}
  }
  return {init,close};
})();
