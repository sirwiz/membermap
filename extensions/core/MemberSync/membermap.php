<?php
/**
 * @brief		Member Sync Extension
 * @author		<a href='http://ipb.silvesterwebdesigns.com'>Stuart Silvester & Martin Aronsen</a>
 * @copyright	(c) 2015 Stuart Silvester & Martin Aronsen
 * @package		IPS Social Suite
 * @subpackage	Member Map
 * @since		20 Oct 2015
 * @version		3.0.0
 */


namespace IPS\membermap\extensions\core\MemberSync;

/* To prevent PHP errors (extending class does not exist) revealing path */
if ( !defined( '\IPS\SUITE_UNIQUE_KEY' ) )
{
	header( ( isset( $_SERVER['SERVER_PROTOCOL'] ) ? $_SERVER['SERVER_PROTOCOL'] : 'HTTP/1.0' ) . ' 403 Forbidden' );
	exit;
}

/**
 * Member Sync
 */
class _membermap
{	
	/**
	 * Member is merged with another member
	 *
	 * @param	\IPS\Member	$member		Member being kept
	 * @param	\IPS\Member	$member2	Member being removed
	 * @return	void
	 */
	public function onMerge( $member, $member2 )
	{
		/* A member can't have multiple locations, so we'll have to delete one of them */
		$memberLoc 	= \IPS\membermap\Map::i()->getMarkerByMember( $member->member_id, FALSE );
		$member2Loc = \IPS\membermap\Map::i()->getMarkerByMember( $member2->member_id, FALSE );

		// Delete $member2's location if $member have one 
		if ( $memberLoc instanceof \IPS\membermap\Markers\Markers )
		{
			if ( $member2Loc instanceof \IPS\membermap\Markers\Markers )
			{
				$member2Loc->delete();
			}
		}
		// Or move $member2's location over to $member.
		else if ( $member2Loc instanceof \IPS\membermap\Markers\Markers )
		{
			$member2Loc->author = $member->member_id;
			$member2Loc->save();
		}
	}
	
	/**
	 * Member is deleted
	 *
	 * @param	$member	\IPS\Member	The member
	 * @return	void
	 */
	public function onDelete( $member )
	{
		$memberLoc 	= \IPS\membermap\Map::i()->getMarkerByMember( $member->member_id, FALSE, FALSE );

		if ( $memberLoc instanceof \IPS\membermap\Markers\Markers )
		{
			$memberLoc->delete();
		}
	}

	/**
	 * Member is flagged as spammer
	 *
	 * @param	$member	\IPS\Member	The member
	 * @return	void
	 */
	public function onSetAsSpammer( $member )
	{
		$memberLoc 	= \IPS\membermap\Map::i()->getMarkerByMember( $member->member_id, FALSE, FALSE );

		if ( $memberLoc instanceof \IPS\membermap\Markers\Markers )
		{
			$memberLoc->hide( NULL );
		}
	}
	
	/**
	 * Member is unflagged as spammer
	 *
	 * @param	$member	\IPS\Member	The member
	 * @return	void
	 */
	public function onUnSetAsSpammer( $member )
	{
		$memberLoc 	= \IPS\membermap\Map::i()->getMarkerByMember( $member->member_id, FALSE, FALSE );

		if ( $memberLoc instanceof \IPS\membermap\Markers\Markers )
		{
			//$memberLoc->hide( NULL ); // Can't use this because of this bug: https://invisionpower.com/4bugtrack/archived-reports/content-classes-assumes-commenting-is-always-available-r12385/
			
			$memberLoc->open = 1;
			$memberLoc->save();

			/* Update search index */
	        if ( $memberLoc instanceof \IPS\Content\Searchable )
	        {
	            \IPS\Content\Search\Index::i()->index( $memberLoc );
	        }
		}
	}

	/**
	 * Member account has been updated
	 *
	 * @param	$member		\IPS\Member	Member updating profile
	 * @param	$changes	array		The changes
	 * @return	void
	 */
	public function onProfileUpdate( $member, $changes )
	{
		/* An endless loop is formed when \Item::createItem() is saving \Member, which then fire this membersync, which then calls \Item::createItem, and so on, and so on */
		static $wereDoneHere = false;

		if ( $wereDoneHere )
		{
			return;
		}

		$wereDoneHere = true;

		if( isset( $changes['name'] ) )
		{
			$existingMarker = \IPS\membermap\Map::i()->getMarkerByMember( $member->member_id, FALSE, FALSE );

			if( $existingMarker instanceof \IPS\membermap\Markers\Markers )
			{
				$existingMarker->name 		= $member->name;
				$existingMarker->updated 	= time();

				$existingMarker->save();
			}
		}

		if( count( $changes ) AND \IPS\Settings::i()->membermap_monitorLocationField AND ! $member->members_bitoptions['bw_is_spammer'] )
		{
			if( \IPS\Settings::i()->membermap_monitorLocationField_groupPerm === '*' or \IPS\Member::loggedIn()->inGroup( explode( ',', \IPS\Settings::i()->membermap_monitorLocationField_groupPerm ) ) )
			{
				if ( isset( $changes['field_' . \IPS\Settings::i()->membermap_profileLocationField ] ) AND ! empty( $changes['field_' . \IPS\Settings::i()->membermap_profileLocationField ] ) )
				{
					try
					{
						$lat = $lng = $location = NULL;
						$fieldValue = $changes['field_' . \IPS\Settings::i()->membermap_profileLocationField ];

						/* If it's an array, it might be from an address field, which already have the lat/lng data */
						if( is_array( json_decode( $fieldValue, TRUE ) ) )
						{
							$addressData = json_decode( $fieldValue, TRUE );

							if ( is_float( $addressData['lat'] ) AND is_float( $addressData['long'] ) )
							{
								$lat = floatval( $addressData['lat'] );
								$lng = floatval( $addressData['long'] );
							}

							$addressData['addressLines'][] = $addressData['city'];

							if ( count( $addressData['addressLines'] ) )
							{
								$location = implode( ', ', $addressData['addressLines'] );
							}
						}
						/* It's a text field, or \IPS\Geolocation failed to get coordinates (in which case we won't bother either */
						else
						{
							/* Remove HTML, newlines, tab, etc, etc */
							$fieldValue = preg_replace( "/[\\x00-\\x20]|\\xc2|\\xa0+/", ' ', strip_tags( $fieldValue ) );
							$fieldValue = trim( preg_replace( "/\s\s+/", ' ', $fieldValue ) );

							/* To my understanding we're not allowed to use \IPS\Geolocation, as that uses Google API, and we're not showing the info on a Google Map. */
							$nominatim = \IPS\membermap\Map::i()->getLatLng( $fieldValue );

							if( is_array( $nominatim ) AND count( $nominatim ) )
							{
								$lat 		= $nominatim['lat'];
								$lng 		= $nominatim['lng'];
								$location 	= $nominatim['location'];
							}
						}

						if( $lat AND $lng )
						{
							$existingMarker = \IPS\membermap\Map::i()->getMarkerByMember( $member->member_id, FALSE );

							if( $existingMarker instanceof \IPS\membermap\Markers\Markers )
							{
								$marker 			= $existingMarker;
								$marker->updated 	= time();
							}
							else
							{
								$groupId = \IPS\membermap\Map::i()->getMemberGroupId();

								$marker = \IPS\membermap\Markers\Markers::createItem( $member, \IPS\Request::i()->ipAddress(), new \IPS\DateTime, \IPS\membermap\Markers\Groups::load( $groupId ) );
							}

							$marker->name 		= $member->name;
							$marker->lat 		= $lat;
							$marker->lon 		= $lng;
							$marker->location 	= $location ?: $fieldValue;
							

							/* Save and add to search index */
							$marker->save();
							\IPS\Content\Search\Index::i()->index( $marker );
						}
					}
					catch ( \Exception $e )
					{
						/* Something went wrong. Such as the input field being an editor */
						\IPS\Log::log( $e, 'membermap' );

						return false;
					}
				}
			}
		}
	}
}