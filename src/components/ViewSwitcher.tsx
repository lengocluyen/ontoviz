export type ViewMode = "3d" | "2d" | "vowl" | "graffoo";

type Props = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const MODES: { id: ViewMode; label: string; title: string; icon: React.ReactNode }[] = [
  {
    id: "3d",
    label: "3D",
    title: "3D force graph",
    icon: <Icon3D />,
  },
  {
    id: "2d",
    label: "2D",
    title: "2D force graph",
    icon: <Icon2D />,
  },
  {
    id: "vowl",
    label: "VOWL",
    title: "VOWL — Web Ontology Language Visualization",
    icon: <IconVOWL />,
  },
  {
    id: "graffoo",
    label: "Graffoo",
    title: "Graffoo — Graphical Framework for OWL Ontologies",
    icon: <IconGraffoo />,
  },
];

export default function ViewSwitcher({ value, onChange }: Props) {
  return (
    <div className="viewSwitcher" role="group" aria-label="Visualization mode">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`viewSwitcherBtn${value === mode.id ? " active" : ""}`}
          onClick={() => onChange(mode.id)}
          title={mode.title}
          aria-pressed={value === mode.id}
        >
          {mode.icon}
          <span className="viewSwitcherLabel">{mode.label}</span>
        </button>
      ))}
    </div>
  );
}

function Icon3D() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2 L18 6 L18 14 L10 18 L2 14 L2 6 Z" />
      <path d="M10 2 L10 18 M2 6 L18 6 M2 14 L18 14" strokeOpacity="0.4" />
    </svg>
  );
}

function Icon2D() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="10" r="2.5" />
      <circle cx="16" cy="4" r="2.5" />
      <circle cx="16" cy="16" r="2.5" />
      <circle cx="10" cy="10" r="2" />
      <line x1="6.5" y1="10" x2="8" y2="10" />
      <line x1="12" y1="10" x2="13.5" y2="10" />
      <line x1="10" y1="8" x2="15" y2="5.5" />
      <line x1="10" y1="12" x2="15" y2="14.5" />
    </svg>
  );
}

function IconVOWL() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="5" fill="currentColor" fillOpacity="0.18" />
      <circle cx="3.5" cy="5" r="2.5" fill="currentColor" fillOpacity="0.18" />
      <circle cx="16.5" cy="5" r="2.5" fill="currentColor" fillOpacity="0.18" />
      <circle cx="10" cy="17" r="2.5" fill="currentColor" fillOpacity="0.18" />
      <line x1="5.5" y1="6.5" x2="7.5" y2="8.5" />
      <line x1="14.5" y1="6.5" x2="12.5" y2="8.5" />
      <line x1="10" y1="15" x2="10" y2="13" />
    </svg>
  );
}

function IconGraffoo() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="7" width="8" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
      <rect x="11" y="7" width="8" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
      <line x1="9" y1="10" x2="11" y2="10" />
      <polygon points="11,8.5 13,10 11,11.5" fill="currentColor" fillOpacity="0.7" stroke="none" />
    </svg>
  );
}
