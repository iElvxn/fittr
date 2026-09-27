import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
  /** Solid disc in `color` with the check knocked out in `checkColor` -- a done state, like HeartIcon's `filled`. */
  filled?: boolean;
  checkColor?: string;
};

/** Thin-stroke check mark -- same family/weight as CloseIcon/PlusIcon. */
export function CheckIcon({ size = 18, color, filled = false, checkColor }: Props) {
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={11} fill={color} />
        <Path
          d="M7 12.5L10.5 16L17 8.5"
          stroke={checkColor ?? 'white'}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5L10 17.5L19 7" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
