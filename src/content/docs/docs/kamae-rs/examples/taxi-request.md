---
title: "タクシー配車の例"
sidebar:
  order: 20
  label: "タクシー配車例"
---

本例はKamae Rustのエンドツーエンド実装である。待機中のリクエストにドライバーを割り当て、状態遷移とドメインイベントを返す典型的なパターンを示す。[ドメインモデリング](/docs/kamae-rs/domain-modeling/) と [状態遷移](/docs/kamae-rs/state-transitions/) の原則を、ひと続きのコードで追える。

```rust
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RequestId(String);

#[derive(Debug, PartialEq, Eq)]
pub enum IdError {
    Empty { field: &'static str },
}

impl RequestId {
    pub fn new(value: impl Into<String>) -> Result<Self, IdError> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(IdError::Empty {
                field: "request_id",
            });
        }
        Ok(Self(value))
    }
}

impl fmt::Display for RequestId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PassengerId(String);

impl PassengerId {
    pub fn new(value: impl Into<String>) -> Result<Self, IdError> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(IdError::Empty {
                field: "passenger_id",
            });
        }
        Ok(Self(value))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DriverId(String);

impl DriverId {
    pub fn new(value: impl Into<String>) -> Result<Self, IdError> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(IdError::Empty { field: "driver_id" });
        }
        Ok(Self(value))
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct WaitingRequest {
    request_id: RequestId,
    passenger_id: PassengerId,
    requires_accessible_vehicle: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub struct EnRouteRequest {
    request_id: RequestId,
    passenger_id: PassengerId,
    driver_id: DriverId,
}

#[derive(Debug, PartialEq, Eq)]
pub struct DriverAssignment {
    driver_id: DriverId,
    accepts_accessibility_requests: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TaxiRequest {
    Waiting(WaitingRequest),
    EnRoute(EnRouteRequest),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TaxiRequestEvent {
    DriverAssigned {
        request_id: RequestId,
        driver_id: DriverId,
    },
}

#[derive(Debug, PartialEq, Eq)]
pub enum DomainError {
    DriverCannotServeAccessibilityRequest,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Transition<TState, TEvent> {
    pub state: TState,
    pub events: Vec<TEvent>,
}

impl DriverAssignment {
    pub fn new(driver_id: DriverId, accepts_accessibility_requests: bool) -> Self {
        Self {
            driver_id,
            accepts_accessibility_requests,
        }
    }
}

impl WaitingRequest {
    pub fn new(
        request_id: RequestId,
        passenger_id: PassengerId,
        requires_accessible_vehicle: bool,
    ) -> Self {
        Self {
            request_id,
            passenger_id,
            requires_accessible_vehicle,
        }
    }

    pub fn assign_driver(
        self,
        driver: DriverAssignment,
    ) -> Result<Transition<EnRouteRequest, TaxiRequestEvent>, DomainError> {
        if self.requires_accessible_vehicle && !driver.accepts_accessibility_requests {
            return Err(DomainError::DriverCannotServeAccessibilityRequest);
        }

        let driver_id = driver.driver_id;
        let state = EnRouteRequest {
            request_id: self.request_id,
            passenger_id: self.passenger_id,
            driver_id,
        };

        Ok(Transition {
            events: vec![TaxiRequestEvent::DriverAssigned {
                request_id: state.request_id.clone(),
                driver_id: state.driver_id.clone(),
            }],
            state,
        })
    }
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)] // fixture helpers and assertion paths
mod tests {
    use super::*;

    fn request_id(value: &str) -> RequestId {
        RequestId::new(value).expect("fixture request id is valid")
    }

    fn passenger_id(value: &str) -> PassengerId {
        PassengerId::new(value).expect("fixture passenger id is valid")
    }

    fn driver_id(value: &str) -> DriverId {
        DriverId::new(value).expect("fixture driver id is valid")
    }

    #[test]
    fn assign_driver_preserves_identity_and_emits_event() {
        let request_id = request_id("req-1");
        let passenger_id = passenger_id("passenger-1");
        let driver_id = driver_id("driver-1");
        let request = WaitingRequest::new(request_id.clone(), passenger_id.clone(), false);
        let driver = DriverAssignment::new(driver_id.clone(), false);

        let transition = request
            .assign_driver(driver)
            .expect("driver can serve request without accessibility needs");

        assert_eq!(
            transition.state,
            EnRouteRequest {
                request_id: request_id.clone(),
                passenger_id: passenger_id.clone(),
                driver_id: driver_id.clone(),
            }
        );
        assert_eq!(
            transition.events,
            vec![TaxiRequestEvent::DriverAssigned {
                request_id,
                driver_id,
            }]
        );
    }

    #[test]
    fn assign_driver_serves_accessibility_request_when_driver_accepts() {
        let request = WaitingRequest::new(request_id("req-3"), passenger_id("passenger-3"), true);
        let driver = DriverAssignment::new(driver_id("driver-3"), true);

        let transition = request
            .assign_driver(driver)
            .expect("accessible driver can serve accessibility request");

        assert!(matches!(transition.state, EnRouteRequest { .. }));
        assert_eq!(transition.events.len(), 1);
    }

    #[test]
    fn taxi_request_enum_stores_waiting_state() {
        let waiting = WaitingRequest::new(request_id("req-4"), passenger_id("passenger-4"), false);

        let request = TaxiRequest::Waiting(waiting);

        assert!(matches!(request, TaxiRequest::Waiting(_)));
    }

    #[test]
    fn rejects_empty_request_id() {
        assert_eq!(
            RequestId::new(" ").unwrap_err(),
            IdError::Empty {
                field: "request_id"
            }
        );
    }

    #[test]
    fn rejects_empty_passenger_id() {
        assert_eq!(
            PassengerId::new("").unwrap_err(),
            IdError::Empty {
                field: "passenger_id"
            }
        );
    }

    #[test]
    fn rejects_empty_driver_id() {
        assert_eq!(
            DriverId::new("  ").unwrap_err(),
            IdError::Empty { field: "driver_id" }
        );
    }

    #[test]
    fn rejects_driver_that_cannot_satisfy_precondition() {
        let request = WaitingRequest::new(request_id("req-2"), passenger_id("passenger-2"), true);
        let driver = DriverAssignment::new(driver_id("driver-2"), false);

        let error = request.assign_driver(driver).unwrap_err();

        assert_eq!(error, DomainError::DriverCannotServeAccessibilityRequest);
    }
}
```
