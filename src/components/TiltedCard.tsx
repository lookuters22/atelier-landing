import { forwardRef, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

const springValues = { damping: 30, stiffness: 100, mass: 2 };

interface TiltedCardProps extends React.HTMLAttributes<HTMLElement> {
  containerHeight?: React.CSSProperties["height"];
  containerWidth?: React.CSSProperties["width"];
  scaleOnHover?: number;
  rotateAmplitude?: number;
  showTooltip?: boolean;
  captionText?: string;
  children?: React.ReactNode;
}

const TiltedCard = forwardRef<HTMLElement, TiltedCardProps>(function TiltedCard(
  {
    containerHeight = "300px",
    containerWidth = "100%",
    scaleOnHover = 1.05,
    rotateAmplitude = 12,
    showTooltip = true,
    captionText = "",
    children,
    ...rest
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLElement>(null);
  const ref = (forwardedRef ?? innerRef) as React.RefObject<HTMLElement>;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, { stiffness: 350, damping: 30, mass: 1 });

  const [lastY, setLastY] = useState(0);

  function handleMouse(e: React.MouseEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude);
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
    rotateFigcaption.set(-(offsetY - lastY) * 0.6);
    setLastY(offsetY);
  }

  function handleMouseEnter() {
    scale.set(scaleOnHover);
    opacity.set(1);
  }

  function handleMouseLeave() {
    opacity.set(0);
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    rotateFigcaption.set(0);
  }

  return (
    <figure
      ref={ref}
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
      style={{
        position: "relative",
        perspective: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: containerHeight,
        width: containerWidth,
        margin: 0,
        ...(rest.style ?? {}),
      }}
    >
      <motion.div
        style={{
          width: "100%",
          transformStyle: "preserve3d",
          rotateX,
          rotateY,
          scale,
        }}
      >
        {children}
      </motion.div>

      {showTooltip && captionText && (
        <motion.figcaption
          className="tilted-card-caption"
          style={{ x, y, opacity, rotate: rotateFigcaption }}
        >
          {captionText}
        </motion.figcaption>
      )}
    </figure>
  );
});

export default TiltedCard;
