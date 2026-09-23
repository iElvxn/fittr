import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
};

/** Thin-stroke pencil -- same family/weight as TrashIcon/CloseIcon/PlusIcon. */
export function PencilIcon({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.7279 4.27208L19.7279 8.27208M4 20.0001L4.79241 16.7106C4.88246 16.3382 5.07091 15.9971 5.33772 15.7231L15.0656 5.72868C15.8598 4.91029 17.166 4.90057 17.9721 5.70723L18.2938 6.02887C19.0972 6.83279 19.0904 8.13539 18.2787 8.93088L8.36133 18.6552C8.08029 18.9301 7.72899 19.1237 7.34535 19.2151L4 20.0001Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
