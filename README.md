# Projekt CZ — spacer po inwestycji

Interaktywna prezentacja konstrukcji z pliku `Projekt CZ.ifc` w Three.js. Uruchom `npm start` i otwórz <http://127.0.0.1:5173>. Biblioteki i parser WASM są pobierane z CDN przy pierwszym otwarciu.

## Oglądanie konstrukcji

- Przeciągnij model, aby go obrócić. Kółko myszy lub gest szczypania zmienia przybliżenie.
- Kliknij element, aby odczytać jego nazwę i numer IFC. Kolory rozróżniają mur, beton konstrukcyjny, strop, dach i fundament Lammi. Kategorie są rozpoznawane po obiektach IFC, również gdy eksport przypisuje ten sam kolor różnym materiałom.
- Kliknięcie w lico muru podświetla pojedynczy bloczek i pokazuje jego współrzędne w ilustracyjnym układzie spoin oraz numer ściany IFC. Moduł 49 × 24 cm, odcienie i faktury służą prezentacji. Plik opisuje całe ściany.
- Dach można otwierać suwakiem lub przyciskiem. Dostępne są cztery ujęcia i 48-sekundowy pokaz. Ręczna zmiana widoku zatrzymuje pokaz. Przejścia uwzględniają preferencję ograniczonego ruchu.

## Spacer

„Wejdź do środka” przenosi na parter. WASD służy do chodzenia, strzałki w lewo i prawo obracają widok. Przeciągnięcie obrazu pozwala rozejrzeć się również w pionie. Na ekranie dotykowym przytrzymaj strzałkę ruchu i obracaj widok palcem. Przycisk kondygnacji przenosi na wybrany poziom. Escape lub „Wróć do modelu” kończy spacer.

Wysokość oczu wynosi 1,62 m. Powierzchnie ruchu są wyznaczane z geometrii płyt. Krawędzie, ściany, słupy i niskie połacie ograniczają dostępny obszar. Eksport przedstawia stan konstrukcyjny budynku.

## WebXR

Przycisk VR pojawia się po wczytaniu modelu w przeglądarce z obsługą immersive-vr. W goglach użytkownik zaczyna na parterze. Spust kontrolera przenosi na widoczną dostępną podłogę wskazaną zielonym promieniem. Przycisk chwytu przełącza parter, piętro i widok zewnętrzny. Wysokość oczu w VR wynika z pozycji gogli. Dostęp z innego urządzenia wymaga HTTPS. Weryfikacja na fizycznym zestawie pozostaje do wykonania.

## Publikacja

GitHub Actions publikuje stronę na GitHub Pages po aktualizacji main. Strona korzysta ze ścieżek względnych i działa także w podkatalogu repozytorium.
