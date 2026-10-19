//! Реестр отмены запросов ClickHouse (п. 3.13, находка RS-06).
//!
//! Раньше в состоянии лежал один `Option<Sender>`: каждый новый запрос заменял его, у прежнего запроса уничтожался отправитель,
//! `cancel_rx` получал ошибку и запрос прерывался сообщением «Запрос отменен пользователем», хотя никто ничего не отменял.
//! Теперь у каждого запроса своя запись с номером; запись снимается, когда запрос закончился (RAII-защёлка `CancelGuard`).
//! «Стоп» без номера (так вызывает фронтенд) отменяет самый поздний из ещё идущих запросов — как и раньше.
//! Реестр общий по типу отправителя: в приложении это `tokio::sync::oneshot::Sender<()>`, в тестах — любой тип.

use std::sync::Mutex;

struct Inner<T> {
    next_id: u64,
    active: Vec<(u64, T)>,
}

pub struct CancelRegistry<T> {
    inner: Mutex<Inner<T>>,
}

impl<T> CancelRegistry<T> {
    pub fn new() -> Self {
        CancelRegistry { inner: Mutex::new(Inner { next_id: 1, active: Vec::new() }) }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner<T>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Запоминает отправителя отмены нового запроса, возвращает его номер.
    pub fn register(&self, sender: T) -> u64 {
        let mut g = self.lock();
        let id = g.next_id;
        g.next_id += 1;
        g.active.push((id, sender));
        id
    }

    /// Снимает запись закончившегося запроса. true — запись ещё была (запрос не отменяли).
    pub fn unregister(&self, id: u64) -> bool {
        let mut g = self.lock();
        let before = g.active.len();
        g.active.retain(|(i, _)| *i != id);
        g.active.len() != before
    }

    /// Забирает отправителя самого позднего из идущих запросов.
    pub fn take_latest(&self) -> Option<T> {
        self.lock().active.pop().map(|(_, s)| s)
    }

    #[allow(dead_code)] // нужна тестам и отладке
    pub fn len(&self) -> usize {
        self.lock().active.len()
    }
}

/// Снимает запись запроса при любом выходе из команды (успех, ошибка, отмена).
pub struct CancelGuard<'a, T> {
    registry: &'a CancelRegistry<T>,
    id: u64,
}

impl<'a, T> CancelGuard<'a, T> {
    pub fn new(registry: &'a CancelRegistry<T>, sender: T) -> Self {
        let id = registry.register(sender);
        CancelGuard { registry, id }
    }
}

impl<'a, T> Drop for CancelGuard<'a, T> {
    fn drop(&mut self) {
        self.registry.unregister(self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_increasing() {
        let r: CancelRegistry<&'static str> = CancelRegistry::new();
        let a = r.register("a");
        let b = r.register("b");
        assert!(b > a);
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn second_query_does_not_replace_first() {
        // RS-06: раньше второй запрос вытеснял отправителя первого
        let r: CancelRegistry<&'static str> = CancelRegistry::new();
        let _a = r.register("first");
        let _b = r.register("second");
        assert_eq!(r.len(), 2);
        assert_eq!(r.take_latest(), Some("second"));
        assert_eq!(r.take_latest(), Some("first"));
        assert_eq!(r.take_latest(), None);
    }

    #[test]
    fn finished_query_is_removed() {
        let r: CancelRegistry<&'static str> = CancelRegistry::new();
        let a = r.register("a");
        let b = r.register("b");
        assert!(r.unregister(b));
        assert!(!r.unregister(b)); // повторно — записи уже нет
        // «Стоп» теперь отменяет ещё идущий первый запрос, а не закончившийся второй
        assert_eq!(r.take_latest(), Some("a"));
        assert!(!r.unregister(a)); // его отправитель уже забран «Стопом»
    }

    #[test]
    fn guard_unregisters_on_drop() {
        let r: CancelRegistry<u8> = CancelRegistry::new();
        {
            let _g = CancelGuard::new(&r, 7);
            assert_eq!(r.len(), 1);
        }
        assert_eq!(r.len(), 0);
        assert_eq!(r.take_latest(), None);
    }

    #[test]
    fn guard_of_cancelled_query_does_not_panic() {
        let r: CancelRegistry<u8> = CancelRegistry::new();
        let g = CancelGuard::new(&r, 1);
        assert_eq!(r.take_latest(), Some(1)); // «Стоп» забрал отправителя
        drop(g); // запись уже снята — тихо
        assert_eq!(r.len(), 0);
    }
}
