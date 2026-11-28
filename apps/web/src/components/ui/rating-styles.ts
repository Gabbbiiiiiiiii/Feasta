// Rating-only colors; keep semantic warning and brand colors unchanged.
export const filledRatingStarClassName = "fill-[#F5B301] text-[#996600]";
export const emptyRatingStarClassName = "fill-none text-gray-500";
export const ratingBarClassName = "bg-[#F5B301]";
export const ratingGlyphClassName = "text-[#F5B301] [-webkit-text-stroke:0.5px_#996600]";

// Native meters require engine-specific fills for consistent colors.
export const ratingMeterClassName = "accent-[#F5B301] [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:rounded-full [&::-webkit-meter-bar]:bg-gray-100 [&::-webkit-meter-optimum-value]:bg-[#F5B301] [&::-webkit-meter-suboptimum-value]:bg-[#F5B301] [&::-webkit-meter-even-less-good-value]:bg-[#F5B301] [&::-moz-meter-bar]:bg-[#F5B301]";
