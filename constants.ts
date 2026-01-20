import { AvatarOption, GradientOption, ImageItem } from './types';

export const AVATARS: AvatarOption[] = [
  { emoji: '🦊', label: 'Fox' }, { emoji: '🐼', label: 'Panda' }, { emoji: '🦁', label: 'Lion' },
  { emoji: '🐮', label: 'Cow' }, { emoji: '🐨', label: 'Koala' }, { emoji: '🐯', label: 'Tiger' },
  { emoji: '🦄', label: 'Unicorn' }, { emoji: '🐲', label: 'Dragon' }, { emoji: '🐙', label: 'Octopus' },
  { emoji: '🐢', label: 'Turtle' }, { emoji: '🦉', label: 'Owl' }, { emoji: '🦖', label: 'T-Rex' },
  { emoji: '🦙', label: 'Llama' }, { emoji: '🦥', label: 'Sloth' }, { emoji: '🦔', label: 'Hedgehog' },
  { emoji: '🐧', label: 'Penguin' }, { emoji: '🐸', label: 'Frog' }, { emoji: '🐵', label: 'Monkey' },
  { emoji: '🐹' , label: 'Hamster' }, { emoji: '🐰', label: 'Rabbit' }, { emoji: '🐺', label: 'Wolf' },
  { emoji: '🐻', label: 'Bear' }, { emoji: '🐷', label: 'Pig' }, { emoji: '🐱', label: 'Cat' }
];

export const GRADIENTS: GradientOption[] = [
  { name: 'Sunset', value: 'from-orange-400 to-rose-500' },
  { name: 'Ocean', value: 'from-blue-400 to-emerald-500' },
  { name: 'Berry', value: 'from-purple-500 to-pink-500' },
  { name: 'Aurora', value: 'from-teal-400 to-blue-500' },
  { name: 'Forest', value: 'from-emerald-400 to-cyan-500' },
  { name: 'Volcano', value: 'from-red-500 to-orange-500' },
  { name: 'Midnight', value: 'from-slate-700 to-slate-900' },
  { name: 'Candy', value: 'from-fuchsia-400 to-purple-600' }
];

export const INITIAL_IMAGE_DECK: ImageItem[] = [
  { 
    id: 'h1', 
    url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80', 
    title: 'Neon Metropolis', 
    description: 'A sprawling city grid pulsing with electric life.', 
    tags: ['city', 'technology', 'night', 'urban'], 
    mediaType: 'image' 
  },
  { 
    id: 'hv1', 
    url: 'https://cdn.pixabay.com/video/2021/04/12/70885-538166548_tiny.mp4', 
    title: 'Circuit Pulse', 
    description: 'Digital information flowing through fiber optic pathways.', 
    tags: ['technology', 'abstract', 'glow', 'speed'], 
    mediaType: 'video' 
  },
  { 
    id: 'h2', 
    url: 'https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?auto=format&fit=crop&w=1200&q=80', 
    title: 'Alpine Peak', 
    description: 'A jagged mountain summit draped in permanent ice.', 
    tags: ['nature', 'mountain', 'cold', 'white'], 
    mediaType: 'image' 
  },
  { 
    id: 'hv2', 
    url: 'https://cdn.pixabay.com/video/2016/09/13/5155-183063071_tiny.mp4', 
    title: 'Midnight Rain', 
    description: 'Raindrops falling into neon-lit puddles in the dark.', 
    tags: ['city', 'weather', 'moody', 'water'], 
    mediaType: 'video' 
  },
  { 
    id: 'h3', 
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80', 
    title: 'Astronaut Voyager', 
    description: 'A lone explorer drifting through the silent void.', 
    tags: ['space', 'adventure', 'mystery', 'technology'], 
    mediaType: 'image' 
  },
  { 
    id: 'hv3', 
    url: 'https://cdn.pixabay.com/video/2020/09/21/50630-462061614_tiny.mp4', 
    title: 'Ember Dance', 
    description: 'Slow-motion sparks rising from an ancient campfire.', 
    tags: ['fire', 'heat', 'nature', 'dark'], 
    mediaType: 'video' 
  },
  { 
    id: 'h4', 
    url: 'https://images.unsplash.com/photo-1439405326854-014607f694d7?auto=format&fit=crop&w=1200&q=80', 
    title: 'Tidal Wave', 
    description: 'The immense, crushing force of a breaking ocean wave.', 
    tags: ['water', 'ocean', 'nature', 'power'], 
    mediaType: 'image' 
  },
  { 
    id: 'hv4', 
    url: 'https://cdn.pixabay.com/video/2019/04/10/22616-328678036_tiny.mp4', 
    title: 'Bioluminescent Abyss', 
    description: 'Deep-sea jellies glowing with their own inner light.', 
    tags: ['ocean', 'animal', 'glow', 'mystery'], 
    mediaType: 'video' 
  },
  { 
    id: 'h5', 
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1200&q=80', 
    title: 'Digital Lava', 
    description: 'Abstract molten textures flowing in vibrant reds.', 
    tags: ['art', 'abstract', 'red', 'motion'], 
    mediaType: 'image' 
  },
  { 
    id: 'hv5', 
    url: 'https://cdn.pixabay.com/video/2023/11/12/188730-883398939_tiny.mp4', 
    title: 'Crystal Blizzard', 
    description: 'Soft snow falling in a perfectly silent pine forest.', 
    tags: ['winter', 'nature', 'peace', 'white'], 
    mediaType: 'video' 
  },
  { 
    id: 'h6', 
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80', 
    title: 'Emerald Valley', 
    description: 'Lush mountain ranges stretching into the mist.', 
    tags: ['nature', 'green', 'peace', 'landscape'], 
    mediaType: 'image' 
  },
  { 
    id: 'h7', 
    url: 'https://images.unsplash.com/photo-1504333638930-c8787321eee0?auto=format&fit=crop&w=1200&q=80', 
    title: 'Ancient Sands', 
    description: 'Timeless patterns carved into desert dunes.', 
    tags: ['nature', 'travel', 'mystery', 'desert'], 
    mediaType: 'image' 
  }
];

export const PRESET_COLLECTIONS = [
  { id: 'cinematic', name: 'Cinematic Deck', icon: '🎬', topics: ['nature', 'technology', 'glow', 'mountain'] },
  { id: 'urban', name: 'Urban Life', icon: '🏙️', topics: ['city', 'architecture', 'night', 'urban'] },
  { id: 'elemental', name: 'The Elements', icon: '🔥', topics: ['fire', 'water', 'winter', 'desert'] },
  { id: 'cosmic', name: 'Deep Space', icon: '🚀', topics: ['space', 'abstract', 'mystery', 'technology'] },
];