import { motion } from 'framer-motion';
import { PhoneMockup } from '../PhoneMockup';
import homeImg from '@assets/app-screens/home.jpg';
import { useEffect, useState } from 'react';

export function Scene2App() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1400),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-start pt-[12vh] overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg-light)' }}
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ y: '-10%', opacity: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}>
      
      {/* Background Decor */}
      <motion.div className="absolute top-0 right-0 w-[80vw] h-[80vw] rounded-full bg-accent/50 blur-3xl -translate-y-1/2 translate-x-1/3" />
      <motion.div className="absolute bottom-0 left-0 w-[60vw] h-[60vw] rounded-full bg-secondary/20 blur-3xl translate-y-1/3 -translate-x-1/3" />

      <div className="relative z-10 text-center px-6 mb-8" dir="rtl">
        <motion.h1 
          className="text-[12vw] font-black text-primary leading-none drop-shadow-sm"
          initial={{ y: 20, opacity: 0 }}
          animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}>
          الطيبات
        </motion.h1>
        <motion.p 
          className="text-[5vw] text-text-primary mt-2 font-bold"
          initial={{ opacity: 0, y: 10 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 20 }}>
          كل أكل بيتك بمكان واحد
        </motion.p>
      </div>

      <motion.div
        className="relative z-20 flex-1 w-full flex justify-center items-end"
        initial={{ y: '100vh', rotate: -15, scale: 0.8 }}
        animate={{ y: '5vh', rotate: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 22, stiffness: 120, delay: 0.3 }}>
        <PhoneMockup>
          <img src={homeImg} alt="Home Screen" className="w-full h-full object-cover" />
        </PhoneMockup>
      </motion.div>
    </motion.div>
  );
}
