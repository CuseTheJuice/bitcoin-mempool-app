'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { themeChange } from 'theme-change';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  // Initialize theme-change
  useEffect(() => {
    themeChange(false); // false to avoid resetting theme on mount
    // Set initial theme based on prefers-color-scheme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = prefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  return (
    <nav className="navbar bg-base-100 shadow-lg" role="navigation">
      <div className="flex-1">
        <Link href="/" className="btn btn-ghost normal-case text-xl">
        A BITCOIN MEMPOOL App {/* Change to "My Template App" if a template */}
        </Link>
      </div>
      <div className="flex-none">
        {/* Hamburger Menu Button */}
        <button
          className="btn btn-square btn-ghost md:hidden"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={isOpen}
          aria-controls="nav-menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className="inline-block w-5 h-5 stroke-current"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        {/* Menu */}
        <ul
          id="nav-menu"
          className={`menu menu-horizontal px-1 ${isOpen ? 'block' : 'hidden'} md:block`}
        >
          <li>
            <Link href="/" onClick={() => setIsOpen(false)}>
              Home
            </Link>
          </li>
          <li>
            <select
              data-choose-theme
              className="select select-bordered max-w-xs"
              aria-label="Select theme"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="cupcake">Cupcake</option>
              <option value="bumblebee">Bumblebee</option>
              <option value="emerald">Emerald</option>
              <option value="corporate">Corporate</option>
              <option value="synthwave">Synthwave</option>
              <option value="retro">Retro</option>
              <option value="cyberpunk">Cyberpunk</option>
              <option value="valentine">Valentine</option>
              <option value="halloween">Halloween</option>
              <option value="garden">Garden</option>
              <option value="forest">Forest</option>
              <option value="aqua">Aqua</option>
              <option value="lofi">Lo-Fi</option>
              <option value="pastel">Pastel</option>
              <option value="fantasy">Fantasy</option>
              <option value="wireframe">Wireframe</option>
              <option value="black">Black</option>
              <option value="luxury">Luxury</option>
              <option value="dracula">Dracula</option>
              <option value="cmyk">CMYK</option>
              <option value="autumn">Autumn</option>
              <option value="business">Business</option>
              <option value="acid">Acid</option>
              <option value="lemonade">Lemonade</option>
              <option value="night">Night</option>
              <option value="coffee">Coffee</option>
              <option value="winter">Winter</option>
              <option value="dim">Dim</option>
              <option value="nord">Nord</option>
              <option value="sunset">Sunset</option>
              <option value="light-plus">Light Plus</option>
              <option value="dark-plus">Dark Plus</option>
              <option value="neon">Neon</option>
            </select>
          </li>
        </ul>
      </div>
    </nav>
  );
}