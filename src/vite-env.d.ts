/// <reference types="vite/client" />

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      'sakutio-global-header': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      'sakutio-global-footer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
