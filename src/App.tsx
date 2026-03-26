import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tv, Play, ExternalLink, Loader2 } from 'lucide-react';
import Hls from 'hls.js';
import { IPTVChannel } from './types';

// Simple M3U Parser
const parseM3U = (data: string): IPTVChannel[] => {
  const lines = data.split('\n');
  const channels: IPTVChannel[] = [];
  let currentChannel: Partial<IPTVChannel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.*)$/);
      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown Channel',
      };
    } else if (line.startsWith('http')) {
      currentChannel.url = line;
      channels.push(currentChannel as IPTVChannel);
      currentChannel = {};
    }
  }
  return channels;
};

export default function App() {
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [activeChannel, setActiveChannel] = useState<IPTVChannel | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch Channels
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const response = await fetch('https://iptv-org.github.io/iptv/countries/in.m3u');
        const data = await response.text();
        const parsed = parseM3U(data);
        setChannels(parsed);
        if (parsed.length > 0) {
          setActiveChannel(parsed[0]);
        }
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch channels:', error);
        setLoading(false);
      }
    };
    fetchChannels();
  }, []);

  // Video Player Logic
  useEffect(() => {
    if (activeChannel && videoRef.current) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(activeChannel.url);
        hls.attachMedia(videoRef.current);
        hlsRef.current = hls;
        videoRef.current.play().catch(e => console.log("Autoplay blocked or failed", e));
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = activeChannel.url;
        videoRef.current.play().catch(e => console.log("Autoplay blocked or failed", e));
      }
    }
  }, [activeChannel]);

  // Handle Remote Control / Keyboard
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        setFocusedIndex(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowDown':
        setFocusedIndex(prev => Math.min(channels.length - 1, prev + 1));
        break;
      case 'Enter':
        setActiveChannel(channels[focusedIndex]);
        break;
      case 'f': // Toggle fullscreen shortcut
        if (videoRef.current) {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            videoRef.current.parentElement?.requestFullscreen();
          }
        }
        break;
    }
  }, [channels, focusedIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-scroll list
  useEffect(() => {
    if (listRef.current) {
      const focusedElement = listRef.current.children[focusedIndex] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [focusedIndex]);

  const openExternal = () => {
    if (activeChannel) {
      window.open(`vlc://${activeChannel.url}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 animate-spin" />
        <span>Loading Channels...</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black font-mono text-white">
      {/* Left Side: Channel List */}
      <div className="flex w-1/3 flex-col border-r border-gray-800 bg-zinc-900">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center">
            <Tv className="mr-2 text-red-500" size={20} />
            CHANNELS ({channels.length})
          </h1>
        </div>
        
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto scrollbar-hide"
        >
          {channels.map((channel, index) => (
            <div
              key={index}
              className={`cursor-pointer p-4 transition-colors ${
                focusedIndex === index 
                  ? 'bg-white text-black font-bold' 
                  : activeChannel?.url === channel.url 
                    ? 'bg-red-900/30 text-red-400' 
                    : 'hover:bg-zinc-800'
              }`}
              onClick={() => {
                setFocusedIndex(index);
                setActiveChannel(channel);
              }}
            >
              <div className="flex items-center">
                <span className="mr-3 text-xs opacity-50">{(index + 1).toString().padStart(3, '0')}</span>
                <span className="truncate">{channel.name}</span>
                {activeChannel?.url === channel.url && <Play size={12} className="ml-auto fill-current" />}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-black text-[10px] text-gray-500 uppercase tracking-widest border-t border-gray-800">
          UP/DOWN: NAVIGATE | ENTER: PLAY | F: FULLSCREEN
        </div>
      </div>

      {/* Right Side: Player & Info */}
      <div className="relative flex flex-1 flex-col bg-black">
        <div className="relative aspect-video w-full bg-zinc-950">
          <video 
            ref={videoRef}
            className="h-full w-full object-contain"
            autoPlay
          />
          {!activeChannel && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600">
              NO SIGNAL
            </div>
          )}
        </div>

        <div className="flex-1 p-8">
          {activeChannel ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tighter text-white">
                  {activeChannel.name}
                </h2>
                <p className="mt-2 text-zinc-500 text-sm">LIVE STREAMING • 1080P • HLS</p>
              </div>

              <div className="flex space-x-4">
                <button 
                  className="flex items-center space-x-2 bg-white px-6 py-2 text-sm font-bold text-black hover:bg-gray-200"
                  onClick={() => videoRef.current?.parentElement?.requestFullscreen()}
                >
                  <Play size={16} fill="black" />
                  <span>FULLSCREEN</span>
                </button>
                <button 
                  className="flex items-center space-x-2 border border-zinc-700 px-6 py-2 text-sm font-bold text-zinc-400 hover:bg-zinc-800"
                  onClick={openExternal}
                >
                  <ExternalLink size={16} />
                  <span>EXTERNAL PLAYER</span>
                </button>
              </div>

              <div className="mt-12 border-t border-zinc-800 pt-8">
                <p className="text-xs text-zinc-600 leading-relaxed">
                  SOURCE: {activeChannel.url}
                  <br />
                  OPTIMIZED FOR ANDROID 4.4.2 KITKAT TV
                  <br />
                  D-PAD NAVIGATION ENABLED
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-800">
              SELECT A CHANNEL TO START
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
