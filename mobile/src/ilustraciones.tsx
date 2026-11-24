// Dibujos con volumen (degradados, brillo y sombra) para el inicio del cliente.
import React from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

export function Camion({ size = 110 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 120 90">
      <Defs>
        <LinearGradient id="c1" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#3A3F86" /><Stop offset="1" stopColor="#1A1C3D" /></LinearGradient>
        <LinearGradient id="c2" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#E4EA5A" /><Stop offset="1" stopColor="#B7BE1C" /></LinearGradient>
      </Defs>
      <Ellipse cx={60} cy={82} rx={46} ry={5} fill="#000" opacity={0.12} />
      <Rect x={8} y={20} width={64} height={44} rx={8} fill="url(#c2)" />
      <Rect x={8} y={20} width={64} height={12} rx={6} fill="#fff" opacity={0.35} />
      <Path d="M72 34h22l14 16v14H72z" fill="url(#c1)" />
      <Path d="M78 39h14l8 10H78z" fill="#9DC3F0" />
      <Circle cx={28} cy={68} r={11} fill="#1A1C3D" /><Circle cx={28} cy={68} r={5} fill="#C9CDE3" />
      <Circle cx={90} cy={68} r={11} fill="#1A1C3D" /><Circle cx={90} cy={68} r={5} fill="#C9CDE3" />
      <Path d="M30 38 L38 46 L54 30" fill="none" stroke="#21244D" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Calendario({ size = 104 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 120 90">
      <Defs>
        <LinearGradient id="k1" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FF8A5B" /><Stop offset="1" stopColor="#C8461B" /></LinearGradient>
      </Defs>
      <Ellipse cx={58} cy={84} rx={40} ry={5} fill="#000" opacity={0.12} />
      <Rect x={20} y={14} width={76} height={66} rx={12} fill="#fff" stroke="#E2E8F0" strokeWidth={2} />
      <Rect x={20} y={14} width={76} height={22} rx={12} fill="url(#k1)" />
      <Rect x={20} y={28} width={76} height={8} fill="url(#k1)" />
      <Rect x={36} y={6} width={8} height={18} rx={4} fill="#21244D" />
      <Rect x={72} y={6} width={8} height={18} rx={4} fill="#21244D" />
      <G fill="#CBD5E1">
        <Rect x={30} y={44} width={12} height={10} rx={3} /><Rect x={48} y={44} width={12} height={10} rx={3} />
        <Rect x={30} y={60} width={12} height={10} rx={3} /><Rect x={48} y={60} width={12} height={10} rx={3} />
      </G>
      <Rect x={66} y={44} width={12} height={10} rx={3} fill="#CFD72A" />
      <G transform="translate(70 52) rotate(-35)">
        <Rect x={0} y={0} width={9} height={34} rx={4.5} fill="#21244D" />
        <Circle cx={4.5} cy={0} r={9} fill="#3A3F86" />
        <Rect x={1.5} y={-10} width={6} height={9} fill="#fff" />
      </G>
    </Svg>
  );
}

export function Equipos({ size = 104 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 120 90">
      <Defs>
        <LinearGradient id="n1" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#F7F9FC" /><Stop offset="1" stopColor="#C9D3E3" /></LinearGradient>
        <LinearGradient id="l1" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="1" stopColor="#D5DCE8" /></LinearGradient>
      </Defs>
      <Ellipse cx={60} cy={84} rx={48} ry={5} fill="#000" opacity={0.12} />
      <Rect x={14} y={4} width={40} height={78} rx={8} fill="url(#n1)" stroke="#9AA8BA" strokeWidth={2} />
      <Path d="M14 34h40" stroke="#9AA8BA" strokeWidth={2} />
      <Rect x={46} y={12} width={3} height={14} rx={1.5} fill="#21244D" /><Rect x={46} y={42} width={3} height={20} rx={1.5} fill="#21244D" />
      <Rect x={62} y={26} width={48} height={56} rx={8} fill="url(#l1)" stroke="#9AA8BA" strokeWidth={2} />
      <Rect x={62} y={26} width={48} height={12} rx={6} fill="#21244D" />
      <Circle cx={86} cy={60} r={15} fill="#2A78D6" /><Circle cx={86} cy={60} r={10} fill="#9DC3F0" />
      <Circle cx={102} cy={18} r={10} fill="#1E8A4C" />
      <Path d="M97 18l3.5 3.5L107 14" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Campana({ size = 96, n = 0 }: { size?: number; n?: number }) {
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 120 90">
      <Defs>
        <LinearGradient id="b1" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#E9EE6A" /><Stop offset="1" stopColor="#AEB51A" /></LinearGradient>
      </Defs>
      <Ellipse cx={60} cy={84} rx={34} ry={5} fill="#000" opacity={0.12} />
      <Path d="M60 8c-18 0-28 14-28 30v18l-8 12h72l-8-12V38c0-16-10-30-28-30z" fill="url(#b1)" />
      <Path d="M42 22c4-6 10-9 16-9" stroke="#fff" strokeWidth={5} opacity={0.6} fill="none" strokeLinecap="round" />
      <Circle cx={60} cy={74} r={8} fill="#21244D" />
      {n > 0 ? (
        <>
          <Circle cx={88} cy={18} r={14} fill="#C8461B" />
          <SvgText x={88} y={23} textAnchor="middle" fontSize={14} fontWeight="900" fill="#fff">{n > 9 ? "9+" : String(n)}</SvgText>
        </>
      ) : null}
    </Svg>
  );
}
