document.addEventListener('DOMContentLoaded',function(){
  var btn=document.querySelector('.mb-nav-toggle'),nav=document.querySelector('.mb-nav');
  if(!btn||!nav)return;
  btn.addEventListener('click',function(){
    var open=nav.classList.toggle('open');
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.setAttribute('aria-label',open?'Close menu':'Open menu');
  });
  nav.addEventListener('click',function(e){
    if(e.target.closest('a')){nav.classList.remove('open');btn.setAttribute('aria-expanded','false');}
  });
});
