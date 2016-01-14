/**
 * Trip Report, by Martin Aronsen
 */
;( function($, _, undefined){
	"use strict";

	ips.createModule('ips.membermap', function() 
	{
		var map = null,
			oms = null,
			geocoder = null,
			defaultMapTypeId = null,
			
			zoomLevel = null,
			previousZoomLevel = null,
			
			initialCenter = null,
			
			mapServices = [],
			
			baseMaps = {},
			overlayMaps = {},
			
			mapMarkers = null,
			allMarkers = [],
			
			icons = [],
			infoWindow = null,
			info = null,
			currentPlace = null,
			isMobileDevice = false,
			isEmbedded = false,
			
			bounds = null,
			
			stuffSize = 0,
			popups = [],

			markerContext = {},

			oldMarkersIndicator = null,

			hasLocation = false;
	
		var initMap = function()
		{
			/* Safari gets cranky if this is loaded after the map is set up */
			$( window ).on( 'scroll resize', function()
			{
				/* Attempting to scroll above viewport caused flickering */
				if ( window.scrollY < 0 )
				{
					return false;
				}
				
				setMapHeight();
				
				map.invalidateSize();
			});

			setMobileDevice( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) );


			/* Showing a single user or online user, get the markers from DOM */
			var getByUser = ips.utils.url.getParam( 'filter' ) == 'getByUser' ? true : false;
			var getOnlineUsers = ips.utils.url.getParam( 'filter' ) == 'getOnlineUsers' ? true : false;

			if ( getByUser || getOnlineUsers )
			{
				if ( !!$( '#mapMarkers' ).html() )
				{
					try {
						var markersJSON = $.parseJSON( $( '#mapMarkers' ).html() );
						if ( markersJSON.length > 0 )
						{
							setMarkers( markersJSON );
						}
						else
						{
							ips.ui.flashMsg.show( ips.getString( 'membermap_no_results' ), { timeout: 3, position: 'bottom' } );
						}
					}
					catch(err) {}
				}
			}

			/* Set lat/lon from URL */
			var centerLat = parseFloat( unescape( ips.utils.url.getParam( 'lat' ) ).replace( ',', '.' ) );
			var centerLng = parseFloat( unescape( ips.utils.url.getParam( 'lng' ) ).replace( ',', '.' ) );
			if ( centerLat && centerLng )
			{
				setCenter( centerLat, centerLng );
			}

			/* Set zoom level from URL */
			var initZoom = parseInt( ips.utils.url.getParam( 'zoom' ) );
			
			if ( initZoom )
			{
				setZoomLevel( initZoom );
			}

			/* Set default map from URL */
			var defaultMap = ips.utils.url.getParam( 'map' );
			if ( defaultMap )
			{
				setDefaultMap( defaultMap );
			}

			/* Are we embedding? */
			setEmbed( ips.utils.url.getParam( 'do' ) == 'embed' ? 1 : 0 );

			
			/* Set a height of the map that fits our browser height */
			setMapHeight();
			
			setupMap();
			

			/* Load all markers */
			loadMarkers();
		
			
			/* Init events */
			initEvents();	
		},
		
		setMobileDevice = function( bool )
		{
			isMobileDevice = bool;
		},
		
		setDefaultMap = function( map )
		{
			defaultMapTypeId = map;
		},
		
		setEmbed = function( bool )
		{
			isEmbedded = bool;
		},
		
		clear =function()
		{
			mapMarkers.clearLayers();
			oms.clearMarkers();
		},
		
		reloadMap = function()
		{
			Debug.log( "Reloading map" );
			clear();
			showMarkers( true );
		},

		setupMap = function()
		{
			var southWest = new L.LatLng( 56.83, -7.14 );
			var northEast = new L.LatLng( 74.449, 37.466 );
			bounds = new L.LatLngBounds(southWest, northEast);

			mapServices.esriworldstreetmap = L.tileLayer.provider( 'Esri.WorldStreetMap' );
			mapServices.thunderforestlandscape = L.tileLayer.provider( 'Thunderforest.Landscape' );
			mapServices.mapquest = L.tileLayer.provider('MapQuestOpen.OSM');			
			mapServices.esriworldtopomap = L.tileLayer.provider( 'Esri.WorldTopoMap' );

			var contextMenu = [];

			contextMenu.push(
			{
				text: ips.getString( 'membermap_centerMap' ),
				callback: function(e) 
				{
					map.flyTo(e.latlng);
				}
			}, 
			'-', 
			{
				text: ips.getString( 'membermap_zoomIn' ),
				icon: icons.zoomIn,
				callback: function() 
				{
					map.zoomIn();
				}
			}, 
			{
				text: ips.getString( 'membermap_zoomOut' ),
				icon: icons.zoomOut,
				callback: function() 
				{
					map.zoomOut();
				}
			});
			

			var defaultMap = 'mapquest';
			var newDefault = '';
			
			if ( typeof ips.utils.cookie.get( 'membermap_baseMap' ) == 'string' && ips.utils.cookie.get( 'membermap_baseMap' ).length > 0 )
			{
				newDefault = ips.utils.cookie.get( 'membermap_baseMap' ).toLowerCase();
			}
			
			if ( defaultMapTypeId !== null )
			{
				newDefault = defaultMapTypeId;
			}
			
			if ( newDefault !== '' )
			{
				if ( mapServices[ newDefault ] !== undefined )
				{
					defaultMap = newDefault;
				}
			}

			map = L.map( 'mapCanvas', 
			{
				zoom: ( zoomLevel || 7 ),
				layers: [ mapServices[ defaultMap ] ],
				contextmenu: ( isMobileDevice ? false : true ),
				contextmenuWidth: 180,
				contextmenuItems: contextMenu,
				fullscreenControl: isMobileDevice ? false : true,
				loadingControl: isMobileDevice ? false : true,
				attributionControl: true,
				crs: L.CRS.EPSG3857
			});
			
			
			if ( isMobileDevice === false ) 
			{
				L.control.scale().addTo(map);
			}

			map.fitBounds( bounds );
			
			oms = new OverlappingMarkerSpiderfier( map, { keepSpiderfied: true } );
			
			var popup = new L.Popup({
				offset: new L.Point(0, -20),
				keepInView: true,
				maxWidth: ( isMobileDevice ? 250 : 300 )
			});
			
			oms.addListener( 'click', function( marker ) 
			{
				popup.setContent( marker.markerData.popup );
				popup.setLatLng( marker.getLatLng() );
				map.openPopup( popup );
			});
			
			oms.addListener('spiderfy', function( omsMarkers ) 
			{
				omsMarkers.each( function( omsMarker )
				{
					omsMarker.setIcon( omsMarker.options.spiderifiedIcon );
				});
				map.closePopup();
			});
			
			oms.addListener('unspiderfy', function(omsMarkers) 
			{
				omsMarkers.each( function( omsMarker )
				{
					omsMarker.setIcon( omsMarker.options.defaultIcon );
				});
			});

			mapMarkers = new L.MarkerClusterGroup({ spiderfyOnMaxZoom: false, zoomToBoundsOnClick: false, disableClusteringAtZoom: ( $( '#mapWrapper' ).height() > 1000 ? 12 : 9 ) });
			
			mapMarkers.on( 'clusterclick', function (a) 
			{
				map.fitBounds( a.layer._bounds );
				if ( map.getZoom() > ( $( '#mapWrapper' ).height() > 1000 ? 12 : 9 ) )
				{
					map.setZoom( $( '#mapWrapper' ).height() > 1000 ? 12 : 9 );
				}
			});

			map.addLayer( mapMarkers );
			
			baseMaps = {
				"MapQuest": mapServices.mapquest,
				"Thunderforest Landscape": mapServices.thunderforestlandscape,
				'Esri WorldTopoMap': mapServices.esriworldtopomap,
				'Esri World Street Map': mapServices.esriworldstreetmap
			};

			overlayMaps = {
				"Members": mapMarkers,
			};

			L.control.layers( baseMaps, overlayMaps, { collapsed: ( isMobileDevice || isEmbedded ? true : false ) } ).addTo( map );

			map.on( 'baselayerchange', function( baselayer )
			{
				ips.utils.cookie.set( 'membermap_baseMap', baselayer.name.toLowerCase().replace( /\s/g, '' ) );
			});
			
			ips.membermap.map = map;
		},
		
		setMarkers = function( markers )
		{
			allMarkers = markers.markers;
		},

		reloadMarkers = function()
		{
			if ( oldMarkersIndicator !== null )
			{
				ips.membermap.map.removeControl( oldMarkersIndicator );
			}
			
			clear();

			loadMarkers( true );
		},
		
		loadMarkers = function( forceReload )
		{
			forceReload = typeof forceReload !== 'undefined' ? forceReload : false;

			if ( ips.utils.url.getParam( 'rebuildCache' ) == 1 || ips.utils.url.getParam( 'dropBrowserCache' ) == 1 )
			{
				forceReload = true;
			}

			/* Skip this if markers was loaded from DOM */
			if ( allMarkers && allMarkers.length > 0 )
			{
				showMarkers();
				return;
			}

			if ( forceReload || ! ips.utils.db.isEnabled() )
			{
				allMarkers = [];

				$.ajax( ipsSettings.baseURL.replace('&amp;','&') + 'datastore/membermap_cache/membermap-index.json',
				{	
					cache : false,
					dataType: 'json',
					success: function( res )
					{
						if ( typeof res.error !== 'undefined' )
						{
							alert(res.error);
						}

						if ( res.fileList.length === 0 )
						{
							return false;
						}

						var promise;

						$.each( res.fileList, function( id, file )
						{
							promise = $.when( promise, 
								$.ajax({
									url: ipsSettings.baseURL.replace('&amp;','&') + '/datastore/' + file,
									cache : false,
									dataType: 'json',
									success:function( res )
									{
										/* Show marker layer */
										showMarkers( false, res );
										allMarkers = allMarkers.concat( res );
									}
								})
							);
						});

						/* Store data in browser when all AJAX calls complete */
						promise.done(function()
						{
							if ( ips.utils.db.isEnabled() )
							{
								var date = new Date();
								ips.utils.db.set( 'membermap', 'markers', { time: ( date.getTime() / 1000 ), data: allMarkers } );
								ips.utils.db.set( 'membermap', 'cacheTime', ips.getSetting( 'membermap_cacheTime' ) );
							}
						});
					}
				});
			}
			else
			{
				/* Get data from browser storage */
				var data 		= ips.utils.db.get('membermap', 'markers' );
				var cacheTime 	= ips.utils.db.get('membermap', 'cacheTime' );
			
				if ( data === null || cacheTime < ips.getSetting( 'membermap_cacheTime' ) )
				{
					reloadMarkers();
					return;
				}

				if ( data.data.length > 0 && typeof data.data !== 'null' )
				{
					/* Reload cache if it's older than 24 hrs */
					var date = new Date( data.time * 1000 ),
					nowdate = new Date;
					if ( ( ( nowdate.getTime() - date.getTime() ) / 1000 ) > 86400 )
					{
						reloadMarkers();
						return;
					}

					allMarkers = data.data;
					showMarkers( false, data.data );
					
					/* Inform that we're showing markers from browser cache */
					if ( oldMarkersIndicator === null && ! isEmbedded )
					{
						oldMarkersIndicator = new L.Control.MembermapOldMarkers({ callback: reloadMarkers, time: date });
						ips.membermap.map.addControl( oldMarkersIndicator );
					}
				}
				else
				{
					reloadMarkers();
					return;
				}
			}

		},
		
		initEvents = function()
		{
			/* And adjust it if we resize our browser */
			if ( isMobileDevice === false && isEmbedded === false )
			{
				$( "#mapWrapper" ).resizable(
				{
					zIndex: 15000,
					handles: 's',
					stop: function(event, ui) 
					{
						$(this).css("width", '');
					},
					resize: function( event, ui )
					{
						map.invalidateSize();
					}
				});
			}


			
			/* Contextual menu */
			/* Needs to run this after the markers, as we need to know if we're editing or adding the location */
			if ( ips.getSetting( 'member_id' ) )
			{
				if ( hasLocation && ips.getSetting( 'membermap_canEdit' ) )
				{
					map.contextmenu.insertItem(
					{
						'text': ips.getString( 'membermap_context_editLocation' ),
						callback: updateLocation
					}, 0 );
					map.contextmenu.insertItem( { separator: true }, 1 );
				}
				else if ( ! hasLocation && ips.getSetting( 'membermap_canAdd' ) )
				{
					map.contextmenu.insertItem(
					{
						'text': ips.getString( 'membermap_context_addLocation' ),
						callback: updateLocation
					}, 0 );
					map.contextmenu.insertItem( { separator: true }, 1 );
				}
			}
			

			
			/* Get by member */
			$( '#elInput_membermap_memberName' ).on( 'tokenAdded tokenDeleted', function()
			{
				reloadMap();
			});

			$( '#membermap_button_addLocation' ).click( function()
			{
				if ( typeof popups['addLocationPopup'] === 'object' )
				{
					popups['addLocationPopup'].destruct();
					popups['addLocationPopup'].remove();
					delete popups['addLocationPopup'];
				}

				popups['addLocationPopup'] = ips.ui.dialog.create({
					title: ips.getString( 'membermap_location_title' ),
					url: ips.getSetting('baseURL') + 'index.php?app=membermap&module=membermap&controller=showmap&do=add',
					callback: function()
					{
						if( ! navigator.geolocation )
						{
							$( '#membermap_geolocation_wrapper' ).hide();
						}
						else
						{
							$( '#membermap_currentLocation' ).click( processGeolocation );
						}

						$( '#elInput_membermap_location' ).autocomplete({
							source: function( request, response ) 
							{
								ips.getAjax()({ 
									//url: 'http://www.mapquestapi.com/geocoding/v1/address', 
									url: 'http://open.mapquestapi.com/nominatim/v1/search.php',
									type: 'get',
									dataType: 'json',
									data: {
										key: "pEPBzF67CQ8ExmSbV9K6th4rAiEc3wud",

										// MapQuest Geocode
										/*location: request.term,
										outFormat: 'json'*/

										// MapQuest Nominatim
										format: 'json',
										q: request.term,
										extratags: 0,

									},
									success: function( data ) 
									{
										// MapQuest
										/* If adminArea5 is empty, it's likely we don't have a result */
										/*if ( data.results[0].locations[0].adminArea5 )
										{
											response( $.map( data.results[0].locations, function( item )
											{
												return {
													value: item.adminArea5 + 
														( item.adminArea4 ? ', ' + item.adminArea4 : '' ) + 
														( item.adminArea3 ? ', ' + item.adminArea3 : '' ) + 
														( item.adminArea2 ? ', ' + item.adminArea2 : '' ) +
														( item.adminArea1 ? ', ' + item.adminArea1 : '' ),
													latLng: item.latLng
												};
											}));
										}
										else
										{
											response([]);
										}*/

										// MapQuest Nominatim
										response( $.map( data, function( item )
										{
											return {
												value: item.display_name,
												latLng: {
													lat: item.lat,
													lng: item.lon
												}
											};
										}));

									}
								})
							},
							minLength: 3,
							select: function( event, ui ) {
								$( '#membermap_form_location input[name="lat"]' ).val( parseFloat( ui.item.latLng.lat).toFixed(6) );
								$( '#membermap_form_location input[name="lng"]' ).val( parseFloat( ui.item.latLng.lng).toFixed(6) );
							}
						});

						$( '#membermap_form_location' ).on( 'submit', function(e)
						{
							if ( $( '#membermap_form_location input[name="lat"]' ).val().length == 0 || $( '#membermap_form_location input[name="lng"]' ).val().length == 0 )
							{
								e.preventDefault();
								return false;
							}
						});
					}
				});

				popups['addLocationPopup'].show();
			})
		},



		processGeolocation = function(e)
		{
			e.preventDefault();
			if(navigator.geolocation)
			{
				navigator.geolocation.getCurrentPosition( function( position )
				{
					$( '#membermap_form_location input[name="lat"]' ).val( position.coords.latitude );
					$( '#membermap_form_location input[name="lng"]' ).val( position.coords.longitude );

					ips.getAjax()({ 
						url: 'http://www.mapquestapi.com/geocoding/v1/reverse', 
						type: 'get',
						dataType: 'json',
						data: {
							key: "pEPBzF67CQ8ExmSbV9K6th4rAiEc3wud",
							lat: position.coords.latitude,
							lng: position.coords.longitude

						},
						success: function( data ) 
						{
							// MapQuest
							/* If adminArea5 is empty, it's likely we don't have a result */
							if ( data.results[0].locations[0].adminArea5 )
							{
								var item = data.results[0].locations[0];
								var location = item.adminArea5 + 
											( item.adminArea4 ? ', ' + item.adminArea4 : '' ) + 
											( item.adminArea3 ? ', ' + item.adminArea3 : '' ) + 
											( item.adminArea2 ? ', ' + item.adminArea2 : '' ) +
											( item.adminArea1 ? ', ' + item.adminArea1 : '' );

								$( '#elInput_membermap_location' ).val( location );

								$( '#membermap_form_location' ).submit();
									
							}
							else
							{
								$( '#membermap_geolocation_wrapper' ).hide();
								$( '#membermap_addLocation_error' ).html( ips.getString( 'memebermap_geolocation_error' ) ).show();
							}

						}
					});

				},
				function( error )
				{
					$( '#membermap_addLocation_error' ).append( 'ERROR(' + error.code + '): ' + error.message ).append( '<br />' + ips.getString( 'memebermap_geolocation_error' ) ).show();
					$( '#membermap_geolocation_wrapper' ).hide();
				},
				{
					maximumAge: (1000 * 60 * 15),
					enableHighAccuracy: true
				});
			}
		},

		setZoomLevel = function( setZoomLevel )
		{
			zoomLevel = parseInt( setZoomLevel, 10 );
		},

		setCenter = function( setLat, setLng )
		{
			initialCenter = new L.LatLng( parseFloat( setLat ), parseFloat( setLng ) );
		},
		
		setMapHeight = function()
		{
			if ( stuffSize === 0 )
			{
				stuffSize = $( '#membermapWrapper' ).offset().top;
			}
			
			var browserHeight = $( window ).height();
			
			var scrollY = ( window.pageYOffset !== undefined ) ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop; /* DIE IE */
			var leftForMe;
			
			if ( scrollY > stuffSize )
			{
				leftForMe = $( window ).height();
			}
			else
			{
				leftForMe = browserHeight - stuffSize + scrollY;
			}
			if ( $( '#mapWrapper' ).height() !== leftForMe )
			{
				$( '#mapWrapper' ).css( { height: leftForMe } );
				
				return true;
			}
			
			return false;
		},
	
		showMarkers = function( dontRepan, markers )
		{
			dontRepan = typeof dontRepan !== 'undefined' ? dontRepan : false;
			markers = typeof markers !== 'undefined' ? markers : false;

			var getByUser 	= ips.utils.url.getParam( 'filter' ) == 'getByUser' ? true : false;
			var memberId 	= parseInt( ips.utils.url.getParam( 'member_id' ) );
			var flyToZoom 	= 8;

			if ( markers === false )
			{
				markers = allMarkers;
			}

			if ( markers.length === 0 )
			{
				return false;
			}

			var memberSearch = $( '#elInput_membermap_memberName_wrapper .cToken' ).eq(0).attr( 'data-value' );

			var hasLocation = false;

			$.each( markers, function() 
			{		
				/* Don't show these, as they all end up in the middle of the middle of the South Atlantic Ocean. */
				if ( this.lat == 0 && this.lon == 0 )
				{
					return;
				}

				/* Report written by selected member? */
				if ( typeof memberSearch !== 'undefined' )
				{
					/* Names of 'null' are deleted members */
					if (this.name == null || memberSearch.toLowerCase() !== this.name.toLowerCase() )
					{
						return;
					}
				}
				
				var bgColour 	= 'darkblue';
				var icon 		= 'user';
				var iconColour 	= 'white';

				if ( this.type == 'member' )
				{
					if ( this.member_id == ips.getSetting( 'member_id' ) )
					{
						/* This is me! */
						icon = 'home';
						bgColour = 'green';

						/* Update the button label while we're here */
						if ( ips.getSetting( 'membermap_canEdit' ) )
						{
							$( '#membermap_button_addLocation' ).html( ips.getString( 'membermap_button_editLocation' ) );
						}
						else
						{
							/* You don't have permission to update your location. Might as well remove the button */
							$( '#membermap_button_addLocation' ).remove();
						}

						hasLocation = true;

						if ( ips.utils.url.getParam( 'goHome' ) == 1 )
						{
							getByUser 	= true;
							memberId 	= this.member_id;
							flyToZoom 	= 10;
						}
					}
					else
					{
						if ( this.markerColour )
						{
							bgColour = this.markerColour;
						}
					}
				}
				else
				{
					iconColour 	= this.colour;
					icon 		= this.icon || 'fa-map-marker';
					bgColour 	= this.bgColour;

				}

				var icon = L.AwesomeMarkers.icon({
					prefix: 'fa',
					icon: icon, 
					markerColor: bgColour,
					iconColor: iconColour
				});

				var spiderifiedIcon = L.AwesomeMarkers.icon({
					prefix: 'fa',
					icon: 'users', 
					markerColor: bgColour,
					iconColor: iconColour
				});
				

				var contextMenu = [];
				var enableContextMenu = false;

				if ( ips.getSetting( 'is_supmod' ) ||  ( ips.getSetting( 'member_id' ) == this.member_id && ips.getSetting( 'membermap_canDelete' ) ) )
				{
					enableContextMenu = true;
					contextMenu = getMarkerContextMenu( this );
				}
				
				var mapMarker = new L.Marker( 
					[ this.lat, this.lon ], 
					{ 
						title: this.title,
						icon: icon,
						spiderifiedIcon: spiderifiedIcon,
						defaultIcon: icon,
						contextmenu: enableContextMenu,
					    contextmenuItems: contextMenu
					}
				);
				
				mapMarker.markerData = this;

				oms.addMarker( mapMarker );
				mapMarkers.addLayer( mapMarker );

				if ( getByUser && memberId > 0 && this.type == 'member' && this.member_id == memberId )
				{
					dontRepan = true;
					Debug.log( mapMarker );
					map.flyTo( mapMarker.getLatLng(), flyToZoom );
				}
			});

			/* We don't want to move the map around if we're changing filters or reloading markers */
			if ( dontRepan === false )
			{
				if ( initialCenter instanceof L.LatLng )
				{
					if ( zoomLevel )
					{
						map.flyTo( initialCenter, zoomLevel, { duration: 1.4 } );
					}
					else
					{
						map.flyTo( initialCenter );
					}
				}
				else
				{
					map.fitBounds( mapMarkers.getBounds(), { 
						padding: [50, 50],
						maxZoom: 11
					});
				}
			}
		},

		updateLocation = function( e )
		{
			Debug.log( e );
			ips.ui.alert.show({
				type: 'confirm',
				message: ips.getString( 'membermap_confirm_updateLocation' ),
				callbacks:
				{
					'ok': function() 
					{ 
						var url = ips.getSetting('baseURL') + "index.php?app=membermap&module=membermap&controller=showmap&do=add&csrfKey=" + ips.getSetting( 'csrfKey' );
						ips.getAjax()({ 
							url: url,
							data: {
								lat: e.latlng.lat,
								lng: e.latlng.lng,
								'membermap_form_location_submitted': 1
							},
							type: 'POST'
						}).done( function( data )
						{
							if ( data['error'] )
							{
								ips.ui.alert.show({ type: 'alert', message: data['error'] });
							}
							else
							{
								window.location.replace( ips.getSetting('baseURL') + "index.php?app=membermap&dropBrowserCache=1&goHome=1" );
							}
						}); 
					}
				}
			});
		},


		getMarkerContextMenu = function( marker, markerData )
		{
			
			if ( ips.getSetting( 'is_supmod' ) ||  ( ips.getSetting( 'member_id' ) == marker.member_id && ips.getSetting( 'membermap_canDelete' ) ) ) 
			{
				return [{
					'text': 'Delete',
					index: 0,
					callback: function(e)
					{
						ips.ui.alert.show({
							type: 'confirm',
							callbacks:
							{
								'ok': function() 
								{ 
									var url = ips.getSetting('baseURL') + "index.php?app=membermap&module=membermap&controller=showmap&do=delete&member_id="+ marker.member_id;
									ips.getAjax()({ 
										url: url, 
										type: 'GET'
									}).done( function( data )
									{
										if ( data['error'] )
										{
											ips.ui.alert.show({ type: 'alert', message: data['error'] });
										}
										else
										{
											window.location.replace( ips.getSetting('baseURL') + "index.php?app=membermap&dropBrowserCache=1" );
										}
									}); 
								}
							}
						});
					}
				},
				{
					separator: true,
					index: 1
				}];
			}

			return [];
		},
		
		markerClickFunction = function( marker )
		{
			var hidingMarker = currentPlace;
			
	
			var zoomIn = function( info ) 
			{
				previousZoomLevel = map.getZoom();
				
				//map.setCenter( marker.getLatLng() );
				map.flyTo( marker.getLatLng() );
				if ( map.getZoom() <= 11 )
				{
					map.setZoom( 11 );
				}
				
			};
			
			if ( currentPlace ) 
			{
				if ( hidingMarker !== marker ) 
				{
					zoomIn( marker.markerData );
				}
				else
				{
					currentPlace = null;
					map.setZoom( previousZoomLevel );
				}
			} 
			else 
			{
				zoomIn( marker.markerData );
			}
			
			currentPlace = marker;
		};

		return {
			initMap: initMap,
			setDefaultMap: setDefaultMap,
			setMarkers: setMarkers,
			setCenter: setCenter,
			setZoomLevel: setZoomLevel,
			map: map,
			loadMarkers: loadMarkers
		};
	});
}(jQuery, _));


L.Control.MembermapOldMarkers = L.Control.extend({
    options: {
        position: 'topleft',
        time: null,
        callback: null
    },
    initialize: function( options )
    {
    	L.setOptions(this, options);
    }, 
    onAdd: function (map) {
        // create the control container with a particular class name
        var container = L.DomUtil.create('div', 'leaflet-control-layers leaflet-control-layers-expanded leaflet-control-regobs-warning');
		//container.setOpacity( 1 );
        /* Date */
        var date = this.options.time.toLocaleString();
		var info = L.DomUtil.create('p', '', container);
		info.innerHTML = 'Showing cached markers<br /> from ' + date;
		
        var link = L.DomUtil.create('a', 'test', container);
		link.innerHTML = 'Refresh';
		link.href = '#';
		link.title = 'Tittel';
		
		L.DomEvent
		    .on(link, 'click', L.DomEvent.preventDefault)
		    .on(link, 'click', this.options.callback );
        // ... initialize other DOM elements, add listeners, etc.

        return container;
    }
});