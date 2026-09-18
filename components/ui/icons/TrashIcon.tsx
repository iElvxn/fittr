import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Thin-stroke trash can -- same family/weight as CloseIcon/PlusIcon. */
export function TrashIcon({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7H19M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7M17 7L16.3 18.5C16.2477 19.3197 15.5667 20 14.7455 20H9.25454C8.43331 20 7.75234 19.3197 7.7 18.5L7 7"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
