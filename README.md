# Projekt CZ — prezentacja architektury

Interaktywna prezentacja modelu `Projekt CZ.ifc` w Three.js z obsługą WebXR.

## Uruchomienie

```bash
npm start
```

Adres: http://127.0.0.1:5173

## Prezentacja

- Cztery etapy pokazu: całość, rozsunięcie i uniesienie połaci dachu, widok przestrzeni pod dachem oraz ponowne złożenie domu.
- „Otwórz dach” uruchamia animację niezależnie od pokazu; suwak pozwala ręcznie ustawić uniesienie od 0 do 100%.
- Dach jest wydzielany z geometrii po identyfikatorach elementów IFC, z zachowaniem materiałów. Model źródłowy pozostaje niezmieniony.
- „Poznaj dom” uruchamia 48-sekundowy pokaz, po którym kamera wraca do widoku całości.
- Pokaz zatrzymuje przycisk, Escape, wybór ujęcia, ręczna obsługa kamery lub przełączenie karty.
- Przeciąganie obraca model; przewijanie przybliża i oddala.
- „Widok całości” przywraca pierwszy kadr; dostępny jest także pełny ekran.
- Preferencja ograniczonego ruchu wyłącza animowane przejścia.
- W zgodnej przeglądarce WebXR dostępny jest tryb VR z zewnętrznymi punktami teleportacji. Nie jest to spacer po wnętrzach. Weryfikacja na fizycznych goglach pozostaje do wykonania.

Ujęcia są zdefiniowane w `frameObject()` w `src/main.js` i dopasowane do rozmiarów modelu oraz ekranu. Przejścia okrążają bryłę zamiast przecinać ją na wprost. `src/roof.js` wydziela połacie dachu. Po otwarciu są rozsunięte i półprzezroczyste, a w ujęciu wnętrza płynnie znikają, aby nie zasłaniać układu; wejście do VR składa dach.

Biblioteki, parser WASM i font są pobierane z internetu. Przed prezentacją należy sprawdzić połączenie; obecna wersja nie zapewnia pracy offline.

## Publikacja

Strona jest publikowana przez GitHub Actions do GitHub Pages po aktualizacji `main`. Publikowane są wyłącznie `index.html`, `src/`, `.nojekyll` i model IFC. Ścieżki zasobów obsługują podkatalog repozytorium.
