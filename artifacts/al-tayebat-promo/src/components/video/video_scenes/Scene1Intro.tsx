import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1Intro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center bg-black overflow-hidden"
      exit={{ opacity: 0, filter: 'blur(10px)', scale: 1.1, transition: { duration: 0.8 } }}>
      
      <motion.video 
        src={`${import.meta.env.BASE_URL}videos/food-bg.mp4`}
        autoPlay muted playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-50"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 4, ease: 'linear' }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/60" />
      
      <div className="relative z-10 text-center px-6" dir="rtl">
        <motion.h1 
          className="text-[12vw] font-black text-white mb-4 leading-tight drop-shadow-2xl"
          initial={{ y: 30, opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 1 ? { y: 0, opacity: 1, filter: 'blur(0px)' } : { y: 30, opacity: 0, filter: 'blur(10px)' }}
          transition={{ type: 'spring', damping: 20 }}>
          حيران شو تطلب؟
        </motion.h1>
        
        <motion.div
          className="bg-primary/90 backdrop-blur-sm text-white px-6 py-3 rounded-full shadow-lg inline-block"
          initial={{ y: 20, opacity: 0, scale: 0.9 }}
          animate={phase >= 2 ? { y: 0, opacity: 1, scale: 1 } : { y: 20, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 15 }}>
          <p className="text-[5vw] font-bold m-0 leading-none">
            أكل صحي، كيتو، ومؤونة بلدية
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
