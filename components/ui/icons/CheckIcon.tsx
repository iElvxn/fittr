import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Thin-stroke check mark -- same family/weight as CloseIcon/PlusIcon. */
export function CheckIcon({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5L10 17.5L19 7" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
