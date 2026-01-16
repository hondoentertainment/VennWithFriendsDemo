
import { AvatarOption, GradientOption, ImageItem } from './types';

export const AVATARS: AvatarOption[] = [
  { emoji: '🦊', label: 'Fox' }, { emoji: '🐼', label: 'Panda' }, { emoji: '🦁', label: 'Lion' },
  { emoji: '🐮', label: 'Cow' }, { emoji: '🐨', label: 'Koala' }, { emoji: '🐯', label: 'Tiger' },
  { emoji: '🦄', label: 'Unicorn' }, { emoji: '🐲', label: 'Dragon' }, { emoji: '🐙', label: 'Octopus' },
  { emoji: '🐢', label: 'Turtle' }, { emoji: '🦉', label: 'Owl' }, { emoji: '🦖', label: 'T-Rex' },
  { emoji: '🦙', label: 'Llama' }, { emoji: '🦥', label: 'Sloth' }, { emoji: '🦔', label: 'Hedgehog' },
  { emoji: '🐧', label: 'Penguin' }, { emoji: '🐸', label: 'Frog' }, { emoji: '🐵', label: 'Monkey' },
  { emoji: '🐹', label: 'Hamster' }, { emoji: '🐰', label: 'Rabbit' }, { emoji: '🐺', label: 'Wolf' },
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
  { id: '1', url: 'https://picsum.photos/id/10/800/800', title: 'Mountain Lake', tags: ['nature', 'water', 'landscape'] },
  { id: '2', url: 'https://picsum.photos/id/1011/800/800', title: 'Woman with Dog', tags: ['people', 'animal', 'lifestyle'] },
  { id: '3', url: 'https://picsum.photos/id/1012/800/800', title: 'Coffee and Book', tags: ['lifestyle', 'food', 'relax'] },
  { id: '4', url: 'https://picsum.photos/id/1015/800/800', title: 'Deep Forest', tags: ['nature', 'green', 'mystery'] },
  { id: '5', url: 'https://picsum.photos/id/1016/800/800', title: 'Canyon River', tags: ['nature', 'adventure', 'travel'] },
  { id: '6', url: 'https://picsum.photos/id/1020/800/800', title: 'Bear in Wild', tags: ['animal', 'nature', 'danger'] },
  { id: '7', url: 'https://picsum.photos/id/1025/800/800', title: 'Beach Sunset', tags: ['nature', 'water', 'sky'] },
  { id: '8', url: 'https://picsum.photos/id/1033/800/800', title: 'Hot Air Balloon', tags: ['travel', 'adventure', 'sky'] },
  { id: '9', url: 'https://picsum.photos/id/1035/800/800', title: 'Waterfall', tags: ['nature', 'water', 'motion'] },
  { id: '10', url: 'https://picsum.photos/id/1039/800/800', title: 'Neon City', tags: ['city', 'technology', 'night'] },
  { id: '11', url: 'https://picsum.photos/id/1044/800/800', title: 'Camping Fire', tags: ['nature', 'adventure', 'fire'] },
  { id: '12', url: 'https://picsum.photos/id/1047/800/800', title: 'Snowy Peak', tags: ['nature', 'cold', 'mountain'] },
  { id: '13', url: 'https://picsum.photos/id/1050/800/800', title: 'Skyline', tags: ['city', 'architecture', 'view'] },
  { id: '14', url: 'https://picsum.photos/id/1054/800/800', title: 'Street Food', tags: ['food', 'city', 'culture'] },
  { id: '15', url: 'https://picsum.photos/id/1059/800/800', title: 'Abstract Art', tags: ['art', 'creative', 'color'] },
  { id: '16', url: 'https://picsum.photos/id/1062/800/800', title: 'Golden Gate', tags: ['travel', 'bridge', 'city'] },
  { id: '17', url: 'https://picsum.photos/id/1067/800/800', title: 'Lush Garden', tags: ['nature', 'plants', 'peace'] },
  { id: '18', url: 'https://picsum.photos/id/1074/800/800', title: 'Big Cat', tags: ['animal', 'wildlife', 'nature'] },
  { id: '19', url: 'https://picsum.photos/id/1084/800/800', title: 'Walrus', tags: ['animal', 'ocean', 'arctic'] },
  { id: '20', url: 'https://picsum.photos/id/111/800/800', title: 'Old Car', tags: ['vintage', 'technology', 'travel'] },
];

export const PRESET_COLLECTIONS = [
  { id: 'nature', name: 'Nature Pack', icon: '🌲', topics: ['nature', 'animal', 'water', 'mountain'] },
  { id: 'city', name: 'Urban Vibes', icon: '🏙️', topics: ['city', 'architecture', 'technology', 'night'] },
  { id: 'chill', name: 'Relax & Cozy', icon: '☕', topics: ['lifestyle', 'food', 'art', 'peace'] },
  { id: 'adventure', name: 'Explorer', icon: '🎒', topics: ['adventure', 'travel', 'mystery', 'wildlife'] },
];
