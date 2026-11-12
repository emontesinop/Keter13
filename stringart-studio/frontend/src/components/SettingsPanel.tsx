import React from "react";
import { Settings } from "../api";
import { ColorField, NumberField, Section, Select, Slider, Toggle, fmt } from "./controls";

type Upd = (group: keyof Settings, key: string, value: any) => void;

export default function SettingsPanel({ s, set, defaults, geometry, onPaletteReplace, onAutoPalette }: {
  s: Settings; set: Upd; defaults: any; geometry: any; onPaletteReplace: (bg: string, cols: any[]) => void;
  onAutoPalette?: (count: number, background: string) => Promise<void>;
}) {
  const [palCount, setPalCount] = React.useState(5);
  const [palBusy, setPalBusy] = React.useState(false);
  const autoPal = async (count = palCount, bg = s.thread.palette_background) => {
    if (!onAutoPalette) return;
    setPalBusy(true);
    try { await onAutoPalette(count, bg); } finally { setPalBusy(false); }
  };
  const im = s.image, b = s.board, t = s.thread, m = s.materials;
  const I = (k: string) => (v: any) => set("image", k, v);
  const B = (k: string) => (v: any) => set("board", k, v);
  const T = (k: string) => (v: any) => set("thread", k, v);
  const M = (k: string) => (v: any) => set("materials", k, v);
  const presets = defaults?.thread_presets ?? {};
  return (
    <div className="panel-scroll">
      <Section title="Image framing">
        <Toggle label="Auto-centre on subject" value={im.auto_center} onChange={I("auto_center")} />
        <Toggle label="Auto-zoom to face" value={im.auto_zoom} onChange={I("auto_zoom")} />
        <Slider label="Zoom" value={im.zoom} min={0.2} max={4} step={0.01} onChange={I("zoom")} unit="×" />
        <Slider label="Offset X" value={im.offset_x} min={-0.5} max={0.5} step={0.005} onChange={I("offset_x")} />
        <Slider label="Offset Y" value={im.offset_y} min={-0.5} max={0.5} step={0.005} onChange={I("offset_y")} />
        <Slider label="Rotation" value={im.rotation} min={-180} max={180} step={0.5} onChange={I("rotation")} unit="°" />
      </Section>
      <Section title="Tone">
        <Toggle label="Auto levels" value={im.auto_levels} onChange={I("auto_levels")} />
        <Slider label="Exposure" value={im.exposure} min={-3} max={3} step={0.05} onChange={I("exposure")} unit="EV" />
        <Slider label="Brightness" value={im.brightness} min={-1} max={1} onChange={I("brightness")} />
        <Slider label="Contrast" value={im.contrast} min={0.1} max={3} onChange={I("contrast")} />
        <Slider label="Gamma" value={im.gamma} min={0.2} max={4} onChange={I("gamma")} />
        <Slider label="Local contrast" value={im.clahe} min={0} max={8} step={0.1} onChange={I("clahe")} hint="CLAHE clip limit; 0 = off" />
        <Slider label="Sharpness" value={im.sharpness} min={0} max={4} step={0.05} onChange={I("sharpness")} />
        <Slider label="Noise reduction" value={im.denoise} min={0} max={1} onChange={I("denoise")} />
        <Slider label="Threshold" value={im.threshold} min={0} max={1} onChange={I("threshold")} hint="Pushes tones toward two levels (graphic look)" />
        <Toggle label="Invert" value={im.invert} onChange={I("invert")} />
      </Section>
      <Section title="Subject & detail" open={false}>
        <Select label="Background" value={im.background_mode} onChange={I("background_mode")}
          options={[{ value: "keep", label: "Keep" }, { value: "simplify", label: "Simplify" }, { value: "remove", label: "Remove" }]} />
        <Slider label="Background strength" value={im.background_strength} min={0} max={1} onChange={I("background_strength")} />
        <Slider label="Edge emphasis" value={im.edge_emphasis} min={0} max={4} step={0.05} onChange={I("edge_emphasis")} />
        <Slider label="Detail preservation" value={im.detail} min={0} max={1} onChange={I("detail")} />
        <Toggle label="Face detection" value={im.face_detection} onChange={I("face_detection")} />
        <Slider label="Face emphasis" value={im.face_emphasis} min={0} max={4} step={0.05} onChange={I("face_emphasis")} />
      </Section>
      <Section title="Board & nails">
        <Select label="Shape" value={b.shape} onChange={B("shape")}
          options={[{ value: "circle", label: "Circle" }, { value: "square", label: "Square" }, { value: "rectangle", label: "Rectangle" }]} />
        {b.shape !== "rectangle" ? (
          <NumberField label={b.shape === "circle" ? "Diameter" : "Side"} value={b.diameter_mm} onChange={B("diameter_mm")} unit="mm" min={50} />
        ) : (<>
          <NumberField label="Width" value={b.width_mm} onChange={B("width_mm")} unit="mm" min={50} />
          <NumberField label="Height" value={b.height_mm} onChange={B("height_mm")} unit="mm" min={50} />
        </>)}
        <NumberField label="Thickness" value={b.thickness_mm} onChange={B("thickness_mm")} unit="mm" />
        <label className="ctl ctl-inline"><span>Material</span>
          <input className="text" value={b.material} onChange={(e) => B("material")(e.target.value)} /></label>
        <Slider label="Nail count" value={b.nail_count} min={50} max={500} step={1} onChange={B("nail_count")} />
        <NumberField label="Edge margin" value={b.edge_margin_mm} onChange={B("edge_margin_mm")} unit="mm" step={0.5} />
        <NumberField label="Nail diameter" value={b.nail_diameter_mm} onChange={B("nail_diameter_mm")} unit="mm" step={0.1} />
        <NumberField label="Nail height" value={b.nail_height_mm} onChange={B("nail_height_mm")} unit="mm" />
        <Select label="Numbering" value={b.numbering} onChange={B("numbering")}
          options={[{ value: "clockwise", label: "Clockwise" }, { value: "counterclockwise", label: "Counter-clockwise" }]} />
        <Slider label="Nail 1 position" value={b.start_angle_deg} min={-180} max={180} step={1} onChange={B("start_angle_deg")} unit="°" hint="0° = 12 o'clock" />
        {geometry && <div className="info-line">Spacing {fmt(geometry.nail_spacing_mm, 2)} mm
          {geometry.angular_step_deg ? ` · ${fmt(geometry.angular_step_deg, 3)}° step · ring Ø ${fmt(geometry.nail_ring_radius_mm * 2, 1)} mm` : ""}
          {geometry.nail_spacing_mm < b.nail_diameter_mm * 2.2 && <span className="warn"> · nails very close</span>}</div>}
      </Section>
      <Section title="Thread & colour">
        <div className="seg">
          {(["mono", "color"] as const).map((v) => (
            <button key={v} className={t.color_mode === v ? "on" : ""} onClick={() => {
              const first = v === "color" && t.color_mode !== "color";
              T("color_mode")(v);
              if (first) autoPal(palCount, "#ffffff");   // first switch: white board + palette from the photo
            }}>
              {v === "mono" ? "Monochrome" : "Multi-colour"}</button>
          ))}
        </div>
        {t.color_mode === "mono" ? (<>
          <Select label="Preset" value={t.preset} onChange={(v: string) => {
            T("preset")(v);
            if (presets[v]) { T("thread_color")(presets[v].thread); T("background_color")(presets[v].background); }
          }} options={[...Object.keys(presets).map((k) => ({ value: k, label: k.replace(/_/g, " ") })), { value: "custom", label: "custom" }]} />
          <ColorField label="Thread" value={t.thread_color} onChange={(v) => { T("preset")("custom"); T("thread_color")(v); }} />
          <ColorField label="Background" value={t.background_color} onChange={(v) => { T("preset")("custom"); T("background_color")(v); }} />
        </>) : (<>
          <button className="primary wide" disabled={palBusy} onClick={() => autoPal()}>
            {palBusy ? "Choosing colours…" : "✦ Choose thread colours from photo"}</button>
          <div className="seg">
            {[3, 4, 5, 6].map((k) => <button key={k} className={palCount === k ? "on" : ""} onClick={() => setPalCount(k)}>{k} colours</button>)}
          </div>
          <p className="hint">Picks the best real thread colours for this photo and board from 30 common shades (skin tones, browns,
            blues…). 5 is usually best. Colours are optimised together, and each colour stays one thread: its line groups are
            joined by running the thread around the outside of the board.</p>
          <Select label="Palette preset" value="" onChange={(k: string) => {
            const p = defaults?.palette_presets?.[k]; if (p) onPaletteReplace(p.background, p.colors);
          }} options={[{ value: "", label: "choose…" }, ...Object.keys(defaults?.palette_presets ?? {}).map((k) => ({ value: k, label: k.toUpperCase() }))]} />
          <ColorField label="Board colour" value={t.palette_background} onChange={T("palette_background")} />
          <div className="palette">
            {t.palette.map((c, i) => (
              <div key={i} className="pal-row">
                <input type="checkbox" checked={c.enabled} onChange={(e) => {
                  const p = [...t.palette]; p[i] = { ...c, enabled: e.target.checked }; T("palette")(p);
                }} />
                <input type="color" value={c.hex} onChange={(e) => { const p = [...t.palette]; p[i] = { ...c, hex: e.target.value }; T("palette")(p); }} />
                <input className="text" value={c.name} onChange={(e) => { const p = [...t.palette]; p[i] = { ...c, name: e.target.value }; T("palette")(p); }} />
                <button className="icon" onClick={() => T("palette")(t.palette.filter((_, k) => k !== i))}>✕</button>
              </div>
            ))}
            {t.palette.length < 12 && <button className="ghost small" onClick={() => T("palette")([...t.palette, { name: "Thread", hex: "#888888", enabled: true }])}>+ Add colour</button>}
          </div>
        </>)}
        <NumberField label="Thread thickness" value={t.thickness_mm} onChange={T("thickness_mm")} unit="mm" step={0.01} min={0.03} />
        <Slider label="Fibre opacity" value={t.opacity} min={0.05} max={1} onChange={T("opacity")} />
        <Toggle label="Automatic tone mapping" value={t.auto_tone} onChange={T("auto_tone")}
          hint="Uses the measured best mapping for your thread/board contrast. Turn off to set the two values below yourself." />
        {!t.auto_tone && <>
        <Slider label="Max coverage" value={t.max_coverage} min={0.3} max={0.99} onChange={T("max_coverage")} hint="Darkest achievable coverage of the board by thread" />
        <Slider label="Tone physics" value={t.tone_physics} min={0} max={1} onChange={T("tone_physics")}
          hint="1 = exact linear-light mixing (best for dark thread on a light board); lower values lighten mid-tones and use fewer lines" />
        </>}
      </Section>
      <Section title="Materials & cost" open={false}>
        <NumberField label="Knot allowance" value={m.knot_allowance_mm} onChange={M("knot_allowance_mm")} unit="mm" />
        <NumberField label="Tension slack" value={m.slack_percent} onChange={M("slack_percent")} unit="%" />
        <NumberField label="Waste" value={m.waste_percent} onChange={M("waste_percent")} unit="%" />
        <Select label="Wrap style" value={m.wrap_style} onChange={M("wrap_style")}
          options={[{ value: "contact", label: "Contact only" }, { value: "full_loop", label: "Full loop" }]} />
        <NumberField label="Time / connection" value={m.seconds_per_connection} onChange={M("seconds_per_connection")} unit="s" step={0.5} />
        <NumberField label="Time / section" value={m.seconds_per_section} onChange={M("seconds_per_section")} unit="s" />
        <NumberField label="Time / nail" value={m.seconds_per_nail} onChange={M("seconds_per_nail")} unit="s" />
        <NumberField label="Nail price" value={m.nail_price} onChange={M("nail_price")} step={0.01} unit={m.currency} />
        <NumberField label="Board price" value={m.board_price} onChange={M("board_price")} unit={m.currency} />
        <NumberField label="Spool price" value={m.thread_price_per_spool} onChange={M("thread_price_per_spool")} unit={m.currency} />
        <NumberField label="Spool length" value={m.spool_length_m} onChange={M("spool_length_m")} unit="m" />
        <NumberField label="Other costs" value={m.other_costs} onChange={M("other_costs")} unit={m.currency} />
        <label className="ctl ctl-inline"><span>Currency</span>
          <input className="text short" value={m.currency} onChange={(e) => M("currency")(e.target.value)} /></label>
      </Section>
    </div>
  );
}
