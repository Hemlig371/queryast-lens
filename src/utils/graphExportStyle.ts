// CSS на время захвата графа: прячет полосы прокрутки только внутри области графа (не в редакторе и таблице).

/** `scope` — селектор области, внутри которой полосы прокрутки скрываются (например, `.react-flow__viewport`). */
export const scopedHideScrollbarsCss = (scope: string): string => `
    ${scope} ::-webkit-scrollbar,
    ${scope} ::-webkit-scrollbar-button,
    ${scope} ::-webkit-scrollbar-thumb,
    ${scope} ::-webkit-scrollbar-track {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
    }
    ${scope}, ${scope} * {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
  `;
