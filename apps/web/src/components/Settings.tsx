export function Settings() {
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>模型策略</h2>
        </div>
        <div className="settings-list">
          <div>
            <strong>普通内部资料</strong>
            <span>允许云端 embedding 和 chat。</span>
          </div>
          <div>
            <strong>客户敏感</strong>
            <span>默认禁用云端处理，管理员显式开启后才允许。</span>
          </div>
          <div>
            <strong>高敏资料</strong>
            <span>不进入云端处理链路。</span>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>检索策略</h2>
        </div>
        <div className="settings-list">
          <div>
            <strong>资料不足</strong>
            <span>严格模式，低于阈值不让模型自由发挥。</span>
          </div>
          <div>
            <strong>置信度</strong>
            <span>按检索相关度显示提醒，低置信度需要核对引用来源。</span>
          </div>
        </div>
      </section>
    </div>
  );
}
