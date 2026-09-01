export function SakutioHeader() {
  return (
    <sakutio-global-header>
      <div className="sakutio-header-fallback">
        <a className="sakutio-header-fallback__brand" href="https://sakutio.com/">Sakutio</a>
        <nav aria-label="Sakutio共通ナビゲーション">
          <a href="https://sakutio.com/#tools">ツール一覧</a>
          <a href="https://sakutio.com/about/">Sakutioについて</a>
          <a href="https://sakutio.com/contact/">お問い合わせ</a>
        </nav>
      </div>
    </sakutio-global-header>
  )
}
