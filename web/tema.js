// Claro u oscuro. La página sigue el modo del dispositivo; con el botón de la barra se elige
// el otro, y esa elección se guarda en este dispositivo (nada sale de él).
//
// Es un script normal, no un módulo, y va en el <head> después de las hojas de estilo: así el
// modo elegido está puesto antes de que se pinte nada y la página no parpadea al abrir.
(() => {
  const CLAVE = "morlaco:tema";
  const AZUL_AUTOMATICO = "screen and (prefers-color-scheme: light)";
  const raiz = document.documentElement;
  const sistema = window.matchMedia("(prefers-color-scheme: dark)");

  const guardado = () => {
    try {
      const valor = localStorage.getItem(CLAVE);
      return valor === "dark" || valor === "light" ? valor : null;
    } catch {
      return null;
    }
  };

  /** Pone el modo elegido ("dark", "light") o, con null, vuelve a seguir al dispositivo. */
  const aplicar = (tema) => {
    if (tema) raiz.dataset.theme = tema;
    else delete raiz.dataset.theme;
    // El encabezado azul es del modo claro: su hoja se enciende o se apaga con el modo.
    const azul = document.getElementById("hoja-muro-claro");
    if (azul) azul.media = tema === "light" ? "screen" : tema === "dark" ? "not all" : AZUL_AUTOMATICO;
    // Para los campos, las listas y las barras de desplazamiento del navegador.
    document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", tema ?? "light dark");
    // El color de la barra del navegador en el celular.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.dataset.media ??= meta.media;
      meta.dataset.color ??= meta.content;
    }
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    const elegido = metas.find((m) => m.dataset.media.includes(tema ?? "ninguno"));
    for (const meta of metas) meta.content = elegido ? elegido.dataset.color : meta.dataset.color;
  };

  const oscuro = () => (raiz.dataset.theme ? raiz.dataset.theme === "dark" : sistema.matches);
  const avisar = () => window.dispatchEvent(new Event("morlaco:tema"));

  /** Pasa al otro modo. Si coincide con el del dispositivo, no se guarda nada: se le sigue. */
  const cambiar = () => {
    const nuevo = oscuro() ? "light" : "dark";
    const igualAlSistema = (nuevo === "dark") === sistema.matches;
    try {
      if (igualAlSistema) localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, nuevo);
    } catch {
      // Sin almacenamiento (modo privado): el cambio vale mientras la página esté abierta.
    }
    aplicar(igualAlSistema ? null : nuevo);
    avisar();
  };

  /**
   * Prepara el botón de la barra: muestra la luna de día y el sol de noche, y su nombre dice
   * a qué modo cambia. `nombres` trae ese nombre ya traducido: { oscuro, claro }.
   */
  const boton = (nodo, nombres) => {
    if (!nodo) return;
    const pintar = () => {
      nodo.dataset.modo = oscuro() ? "oscuro" : "claro";
      nodo.setAttribute("aria-label", oscuro() ? nombres.claro : nombres.oscuro);
      nodo.title = oscuro() ? nombres.claro : nombres.oscuro;
    };
    nodo.addEventListener("click", cambiar);
    window.addEventListener("morlaco:tema", pintar);
    pintar();
    nodo.hidden = false;
  };

  // Si el dispositivo cambia de modo y la página lo sigue, también se avisa (al mapa, al botón).
  sistema.addEventListener("change", () => {
    if (!raiz.dataset.theme) avisar();
  });

  aplicar(guardado());
  window.morlacoTema = { oscuro, cambiar, boton };

  // ---------- Letra grande ----------
  // Agranda toda la página (texto y botones, que van en rem) para quien lee con la letra del
  // celular al máximo. Se guarda en este dispositivo y se pone antes de pintar, como el modo.
  const CLAVE_LETRA = "morlaco:letra";
  const letraGrande = () => raiz.dataset.letra === "grande";
  const ponerLetra = (grande) => {
    if (grande) raiz.dataset.letra = "grande";
    else delete raiz.dataset.letra;
  };
  try {
    ponerLetra(localStorage.getItem(CLAVE_LETRA) === "grande");
  } catch {
    // Sin almacenamiento: tamaño normal.
  }
  /** El botón "Aa": `nombres` trae { agrandar, achicar }, ya traducidos. */
  const botonLetra = (nodo, nombres) => {
    if (!nodo) return;
    const pintar = () => {
      nodo.setAttribute("aria-pressed", String(letraGrande()));
      nodo.setAttribute("aria-label", letraGrande() ? nombres.achicar : nombres.agrandar);
      nodo.title = letraGrande() ? nombres.achicar : nombres.agrandar;
    };
    nodo.addEventListener("click", () => {
      ponerLetra(!letraGrande());
      try {
        if (letraGrande()) localStorage.setItem(CLAVE_LETRA, "grande");
        else localStorage.removeItem(CLAVE_LETRA);
      } catch {
        // Sin almacenamiento: vale mientras la página esté abierta.
      }
      pintar();
      // El mapa cambia de alto con la letra: que se vuelva a medir.
      window.dispatchEvent(new Event("resize"));
    });
    pintar();
    nodo.hidden = false;
  };
  window.morlacoLetra = { grande: letraGrande, boton: botonLetra };
})();
