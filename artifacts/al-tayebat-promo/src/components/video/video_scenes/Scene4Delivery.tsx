import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4Delivery() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-end pb-[20vh] bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: '100%', transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }}>
      
      <motion.video 
        src={`${import.meta.env.BASE_URL}videos/driver.mp4`}
        autoPlay muted playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-70"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 5, ease: 'easeOut' }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
      
      <div className="relative z-10 text-center px-6" dir="rtl">
        <motion.div
          className="overflow-hidden"
          initial={{ height: 0 }}
          animate={phase >= 1 ? { height: 'auto' } : { height: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}>
          <h2 className="text-[10vw] font-black text-white mb-2 leading-none drop-shadow-lg">
            توصيل سريع
          </h2>
        </motion.div>
        
        <motion.div
          className="bg-secondary text-white px-6 py-2 rounded-lg shadow-xl inline-block mt-4"
          initial={{ x: -100, opacity: 0, skewX: 20 }}
          animate={phase >= 2 ? { x: 0, opacity: 1, skewX: 0 } : { x: -100, opacity: 0, skewX: 20 }}
          transition={{ type: 'spring', damping: 15 }}>
          <p className="text-[6vw] font-bold m-0 leading-none">
            لباب بيتك، طازج ومضمون
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
